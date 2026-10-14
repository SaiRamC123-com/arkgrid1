const { admin, db } = require("../config/firebaseAdmin");
const { validCoords } = require("../utils/geo");
const realtime = require("../services/realtime");
const ml = require("../services/mlClient");

const { FieldValue } = require("firebase-admin/firestore");

const SITUATIONS = ["water_borne", "on_foot", "stranded"];
const STATUSES = ["active", "found", "closed"];
const SPEED = { slow: 0.2, moderate: 0.6, fast: 1.5 }; // m/s, assessed classes
const CONTACT_LOST_MIN = Number(process.env.CONTACT_LOST_MIN) || 20;
const MAX_ACTIVE = 50;

const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const iso = (ts) => ts?.toDate?.().toISOString() || null;
const given = (v) => v !== undefined && v !== null && v !== "";

const shape = (d) => {
  const s = d.data();
  return {
    id: d.id, name: s.name, situation: s.situation, lat: s.lat, lng: s.lng, accuracy: s.accuracy ?? 50,
    lastSeenAt: iso(s.lastSeenAt), flow: s.flow || null, sosId: s.sosId || null, status: s.status, note: s.note || "",
    demo: !!s.demo, createdByName: s.createdByName || "", createdAt: iso(s.createdAt), updatedAt: iso(s.updatedAt),
  };
};

function parseFlow(f) {
  if (!given(f) || typeof f !== "object") return null;
  const bearing = given(f.bearing) ? Number(f.bearing) : null;
  const cls = given(f.speedClass) ? f.speedClass : null;
  if (bearing !== null && !(bearing >= 0 && bearing < 360)) throw httpError(400, "Flow direction must be 0-359 degrees");
  if (cls !== null && !SPEED[cls]) throw httpError(400, "Invalid flow speed");
  return bearing === null && cls === null ? null : { bearing, speedClass: cls };
}

const actorName = async (uid) => (await db.collection("users").doc(uid).get()).data()?.name || "Staff";

exports.list = async (req, res, next) => {
  try {
    const [snap, sosSnap] = await Promise.all([
      db.collection("searchCases").orderBy("createdAt", "desc").limit(100).get(),
      db.collection("sos").where("status", "==", "active").limit(200).get(),
    ]);
    const cases = snap.docs.map(shape);
    const taken = new Set(cases.filter((c) => c.status === "active" && c.sosId).map((c) => c.sosId));
    const now = Date.now();
    const candidates = sosSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.location && !taken.has(s.id))
      .map((s) => ({ s, last: (s.lastPingAt || s.triggeredAt)?.toMillis?.() || now }))
      .filter(({ last }) => now - last > CONTACT_LOST_MIN * 60000)
      .slice(0, 20)
      .map(({ s, last }) => ({
        sosId: s.id, name: s.name, location: s.location, peopleCount: s.peopleCount || 1,
        lastContactAt: new Date(last).toISOString(), demo: !!s.demo,
      }));
    res.json({ cases, candidates, contactLostMin: CONTACT_LOST_MIN });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!SITUATIONS.includes(b.situation)) throw httpError(400, "Choose a situation");
    const flow = parseFlow(b.flow);

    let name = str(b.name, 60);
    let lat, lng, accuracy, lastSeen, sosId = null;

    if (given(b.sosId)) {
      const sosSnap = await db.collection("sos").doc(String(b.sosId)).get();
      if (!sosSnap.exists || !sosSnap.data().location) throw httpError(404, "That SOS has no usable location");
      const s = sosSnap.data();
      const taken = await db.collection("searchCases").where("sosId", "==", sosSnap.id).where("status", "==", "active").limit(1).get();
      if (!taken.empty) throw httpError(409, "A search case already exists for this SOS");
      sosId = sosSnap.id;
      ({ lat, lng } = s.location);
      accuracy = s.location.accuracy || 50;
      lastSeen = (s.lastPingAt || s.triggeredAt)?.toMillis?.() || Date.now();
      name = name || s.name;
    } else {
      lat = Number(b.lat);
      lng = Number(b.lng);
      if (!validCoords(lat, lng)) throw httpError(400, "A last-known location is required");
      const min = Number(b.lastSeenMinAgo);
      if (!(min >= 0 && min <= 4320)) throw httpError(400, "Last seen must be 0 to 72 hours ago");
      lastSeen = Date.now() - min * 60000;
      accuracy = given(b.accuracy) ? Number(b.accuracy) : 50;
      if (!(accuracy >= 0 && accuracy <= 2000)) throw httpError(400, "Accuracy must be 0-2000 m");
    }
    if (name.length < 2) throw httpError(400, "Name must be 2-60 characters");
    if ((await db.collection("searchCases").where("status", "==", "active").limit(MAX_ACTIVE + 1).get()).size >= MAX_ACTIVE) {
      throw httpError(400, "Too many active search cases. Close some first");
    }

    const ref = db.collection("searchCases").doc();
    await ref.set({
      name, situation: b.situation, lat, lng, accuracy: Math.round(accuracy), lastSeenAt: Timestamp.fromMillis(lastSeen),
      flow, sosId, status: "active", note: str(b.note, 200), demo: false,
      createdBy: req.user.uid, createdByName: await actorName(req.user.uid),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    realtime.invalidate("search");
    res.status(201).json({ case: shape(await ref.get()) });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const ref = db.collection("searchCases").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw httpError(404, "Case not found");
    const b = req.body || {};
    const patch = {};
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw httpError(400, "Invalid status");
      patch.status = b.status;
    }
    if (b.situation !== undefined) {
      if (!SITUATIONS.includes(b.situation)) throw httpError(400, "Invalid situation");
      patch.situation = b.situation;
    }
    if (b.flow !== undefined) patch.flow = parseFlow(b.flow);
    if (b.note !== undefined) patch.note = str(b.note, 200);
    if (!Object.keys(patch).length) throw httpError(400, "Nothing to update");
    patch.updatedAt = FieldValue.serverTimestamp();
    await ref.update(patch);
    realtime.invalidate("search");
    res.json({ case: shape(await ref.get()) });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const ref = db.collection("searchCases").doc(req.params.id);
    if (!(await ref.get()).exists) throw httpError(404, "Case not found");
    await ref.delete();
    realtime.invalidate("search");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const zoneCache = new Map();
exports.zone = async (req, res, next) => {
  try {
    const snap = await db.collection("searchCases").doc(req.params.id).get();
    if (!snap.exists) throw httpError(404, "Case not found");
    const c = snap.data();
    const elapsed = Math.max(1, (Date.now() - (c.lastSeenAt?.toMillis?.() || Date.now())) / 60000);

    const key = [snap.id, Math.floor(elapsed / 5), c.situation, c.flow?.bearing ?? "", c.flow?.speedClass ?? "", c.accuracy].join("|");
    const hit = zoneCache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60000) return res.json({ zone: hit.zone, cached: true });

    const seed = parseInt(snap.id.slice(0, 6), 36) % 1000000 || 7;
    const zone = await ml.searchZone({
      lat: c.lat, lng: c.lng, elapsed_min: elapsed, situation: c.situation,
      bearing_deg: c.flow?.bearing ?? null, speed_ms: c.flow?.speedClass ? SPEED[c.flow.speedClass] : null,
      accuracy_m: c.accuracy ?? 50, seed,
    });
    zoneCache.set(key, { at: Date.now(), zone });
    if (zoneCache.size > 100) zoneCache.delete(zoneCache.keys().next().value);
    res.json({ zone });
  } catch (err) {
    if (err.isAxiosError) {
      if (!err.response) return next(httpError(503, "The search-zone model service is offline. Start the ML service and try again."));
      if (err.response.status === 401) return next(httpError(502, "The ML service rejected the server key. Check ML_API_KEY."));
      return next(httpError(502, "The search-zone model could not run. Try again."));
    }
    next(err);
  }
};

/* Demo cases (commander) */
exports.seedDemo = async (req, res, next) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!validCoords(lat, lng)) throw httpError(400, "Valid lat and lng are required");
    if (!(await db.collection("searchCases").where("demo", "==", true).limit(1).get()).empty) throw httpError(409, "Demo cases already exist");

    const kx = 111320 * Math.cos((lat * Math.PI) / 180);
    const at = (dx, dy) => ({ lat: +(lat + dy / 110540).toFixed(6), lng: +(lng + dx / kx).toFixed(6) });
    const by = await actorName(req.user.uid);
    const base = { status: "active", demo: true, sosId: null, note: "", accuracy: 40, createdBy: req.user.uid, createdByName: by, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    const batch = db.batch();
    batch.set(db.collection("searchCases").doc(), { ...base, name: "Demo: swept from footbridge", situation: "water_borne", ...at(-200, 300), lastSeenAt: Timestamp.fromMillis(Date.now() - 90 * 60000), flow: { bearing: 70, speedClass: "moderate" } });
    batch.set(db.collection("searchCases").doc(), { ...base, name: "Demo: resident left on foot", situation: "on_foot", ...at(600, -400), lastSeenAt: Timestamp.fromMillis(Date.now() - 150 * 60000), flow: null });
    await batch.commit();
    realtime.invalidate("search");
    res.status(201).json({ created: 2 });
  } catch (err) {
    next(err);
  }
};

exports.clearDemo = async (req, res, next) => {
  try {
    const snap = await db.collection("searchCases").where("demo", "==", true).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    realtime.invalidate("search");
    res.json({ removed: snap.size });
  } catch (err) {
    next(err);
  }
};