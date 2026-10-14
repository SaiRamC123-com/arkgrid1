const { admin, db } = require("../config/firebaseAdmin");
const { validCoords, polylineLengthM } = require("../utils/geo");
const { checkRate } = require("../utils/rateLimit");

const { FieldValue } = require("firebase-admin/firestore");

const STATUS = ["passable", "flooded", "blocked"];
const NEEDED = 2;
const STALE_MS = 12 * 3600 * 1000; // road conditions change fast

const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const iso = (ts) => ts?.toDate?.().toISOString() || null;

const shape = (d, uid) => {
  const s = d.data();
  const conf = s.confirmedBy || [];
  const updated = s.updatedAt?.toMillis?.() || Date.now();
  return {
    id: d.id,
    name: s.name,
    status: s.status,
    depthCm: s.depthCm ?? null,
    note: s.note || "",
    coords: s.coords || [],
    lengthM: s.lengthM || 0,
    verified: !!s.verified,
    verifiedBy: s.verifiedByRole || null,
    confirmCount: conf.length,
    confirmationsNeeded: NEEDED,
    confirmedByMe: conf.includes(uid),
    mine: s.uid === uid,
    authorName: s.authorName || "Citizen",
    stale: Date.now() - updated > STALE_MS,
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  };
};

function parseCoords(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 40) {
    throw httpError(400, "Draw the road with 2 to 40 points");
  }
  const pts = raw.map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }));
  if (pts.some((p) => !validCoords(p.lat, p.lng))) throw httpError(400, "Invalid road coordinates");
  return pts.map((p) => ({ lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) }));
}

function cleanFields(b, partial) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has("name")) out.name = str(b.name, 60) || "Unnamed road";
  if (!partial || has("status")) {
    if (!STATUS.includes(b.status)) throw httpError(400, "Status must be passable, flooded or blocked");
    out.status = b.status;
    if (b.status === "flooded" && b.depthCm !== undefined && b.depthCm !== null && b.depthCm !== "") {
      const d = Number(b.depthCm);
      if (!Number.isInteger(d) || d < 0 || d > 300) throw httpError(400, "Depth must be a whole number 0-300 cm");
      out.depthCm = d;
    } else {
      out.depthCm = null;
    }
  }
  if (!partial || has("note")) out.note = str(b.note, 150);
  return out;
}

const isStaff = (req) => req.user.role !== "citizen";

exports.list = async (req, res, next) => {
  try {
    const snap = await db.collection("roads").orderBy("updatedAt", "desc").limit(300).get();
    res.json({ roads: snap.docs.map((d) => shape(d, req.user.uid)) });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const b = req.body || {};
    const coords = parseCoords(b.coords);
    const fields = cleanFields(b, false);
    const length = polylineLengthM(coords);
    if (length < 15 || length > 6000) throw httpError(400, "A road segment must be between 15 m and 6 km long");

    await checkRate(req.user.uid, "roads", 10, 3600 * 1000, "You've marked many roads recently. Try again later.");

    const staff = isStaff(req);
    const user = (await db.collection("users").doc(req.user.uid).get()).data();
    const ref = db.collection("roads").doc();
    await ref.set({
      ...fields,
      coords,
      lengthM: Math.round(length),
      uid: req.user.uid,
      authorName: user?.name || "Citizen",
      verified: staff,
      verifiedByRole: staff ? req.user.role : null,
      confirmedBy: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ road: shape(await ref.get(), req.user.uid) });
  } catch (err) {
    next(err);
  }
};

exports.confirm = async (req, res, next) => {
  try {
    const ref = db.collection("roads").doc(req.params.id);
    const staff = isStaff(req);

    await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) throw httpError(404, "Road report not found");
      const s = snap.data();
      if (s.uid === req.user.uid) throw httpError(403, "You cannot confirm your own report");
      const conf = s.confirmedBy || [];
      if (conf.includes(req.user.uid)) throw httpError(409, "You already confirmed this");

      const next = [...conf, req.user.uid];
      const upd = { confirmedBy: next, updatedAt: FieldValue.serverTimestamp() }; // fresh confirmation = fresh data
      if (!s.verified && (staff || next.length >= NEEDED)) {
        upd.verified = true;
        upd.verifiedByRole = staff ? req.user.role : "community";
      }
      t.update(ref, upd);
    });
    res.json({ road: shape(await ref.get(), req.user.uid) });
  } catch (err) {
    next(err);
  }
};

// Staff: change status or send an empty body to "refresh" (re-confirm) a road.
// Author: can edit own road only while it is still unverified.
exports.update = async (req, res, next) => {
  try {
    const ref = db.collection("roads").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw httpError(404, "Road report not found");
    const s = snap.data();
    const staff = isStaff(req);
    const own = s.uid === req.user.uid;
    if (!staff && !(own && !s.verified)) throw httpError(403, "You cannot edit this road report");

    const patch = cleanFields(req.body || {}, true);
    if (!Object.keys(patch).length && !staff) throw httpError(400, "Nothing to update");

    if (staff) {
      patch.verified = true;
      patch.verifiedByRole = req.user.role;
    } else {
      patch.confirmedBy = []; // edits reset community confirmations
    }
    patch.updatedAt = FieldValue.serverTimestamp();
    await ref.update(patch);
    res.json({ road: shape(await ref.get(), req.user.uid) });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const ref = db.collection("roads").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw httpError(404, "Road report not found");
    const s = snap.data();
    if (!isStaff(req) && !(s.uid === req.user.uid && !s.verified)) throw httpError(403, "You cannot delete this");
    await ref.delete();
    res.json({ message: "Removed" });
  } catch (err) {
    next(err);
  }
};