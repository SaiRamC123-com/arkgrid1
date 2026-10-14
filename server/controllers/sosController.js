const { admin, db, FieldValue, Timestamp } = require("../config/firebaseAdmin");
const { validCoords } = require("../utils/geo");
const { logActivity, familyIdsOf } = require("../utils/activity");
const { scheduleCluster } = require("../services/clusterService");
const NEEDS = ["trapped", "medical", "water", "food", "boat", "shelter"];
const MOBILITY = ["none", "limited", "wheelchair", "bedridden"];
const VULN = ["child", "elderly", "pregnant", "disability", "chronic"];
const BLOOD = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const CLIENT_ID_RE = /^[a-zA-Z0-9-]{16,64}$/;
const PHONE_RE = /^[+\d\s()-]{6,20}$/;

const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const iso = (ts) => ts?.toDate?.().toISOString() || null;

function parseLoc(b) {
  if (b.lat === undefined || b.lat === null || b.lng === undefined || b.lng === null) return null;
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!validCoords(lat, lng)) throw httpError(400, "Invalid coordinates");
  return { lat, lng, accuracy: Math.max(0, Math.round(Number(b.accuracy) || 0)) };
}

// Accept client timestamps only if sane (not future, not older than 7 days)
function parseDate(v) {
  const d = new Date(v);
  if (!v || isNaN(d)) return null;
  const now = Date.now();
  if (d.getTime() > now + 60000 || d.getTime() < now - 7 * 86400000) return null;
  return d;
}

const shape = (d) => {
  const s = d.data();
  return {
    id: d.id,
    uid: s.uid,
    name: s.name,
    phone: s.phone,
    status: s.status,
    resolution: s.resolution || null,
    location: s.location || null,
    needs: s.needs || [],
    peopleCount: s.peopleCount || 1,
    message: s.message || "",
    medical: s.medical || null,
    delayedSec: s.delayedSec || 0,
    pingCount: s.pingCount || 0,
    triggeredAt: iso(s.triggeredAt),
    receivedAt: iso(s.receivedAt),
    locationAt: iso(s.locationAt),
    lastPingAt: iso(s.lastPingAt),
    resolvedAt: iso(s.resolvedAt),
  };
};

async function getUser(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) throw httpError(404, "Profile not found");
  return snap.data();
}

async function getOwnSOS(id, uid) {
  const ref = db.collection("sos").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, "SOS not found");
  if (snap.data().uid !== uid) throw httpError(403, "Not your SOS");
  return { ref, data: snap.data() };
}

/* ---------- Medical profile ---------- */

exports.getMedical = async (req, res, next) => {
  try {
    const user = await getUser(req.user.uid);
    res.json({
      medical: user.medical || {
        bloodGroup: "", mobility: "none", vulnerabilities: [],
        conditions: "", allergies: "", medications: "", contacts: [],
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.saveMedical = async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!BLOOD.includes(b.bloodGroup || "")) throw httpError(400, "Invalid blood group");
    if (!MOBILITY.includes(b.mobility || "none")) throw httpError(400, "Invalid mobility value");

    const contacts = (Array.isArray(b.contacts) ? b.contacts : [])
      .slice(0, 3)
      .map((c) => ({ name: str(c.name, 50), phone: str(c.phone, 20), relation: str(c.relation, 30) }))
      .filter((c) => c.name || c.phone);
    for (const c of contacts) {
      if (!c.name) throw httpError(400, "Each emergency contact needs a name");
      if (!PHONE_RE.test(c.phone)) throw httpError(400, `Invalid phone number for ${c.name}`);
    }

    const medical = {
      bloodGroup: b.bloodGroup || "",
      mobility: b.mobility || "none",
      vulnerabilities: (Array.isArray(b.vulnerabilities) ? b.vulnerabilities : []).filter((v) => VULN.includes(v)),
      conditions: str(b.conditions, 300),
      allergies: str(b.allergies, 200),
      medications: str(b.medications, 300),
      contacts,
    };

    await db.collection("users").doc(req.user.uid).update({ medical, medicalUpdatedAt: FieldValue.serverTimestamp() });
    res.json({ medical });
  } catch (err) {
    next(err);
  }
};

/* ---------- SOS lifecycle ---------- */

exports.createSOS = async (req, res, next) => {
  try {
    const b = req.body || {};
    const uid = req.user.uid;
    const clientId = String(b.clientId || "");
    if (!CLIENT_ID_RE.test(clientId)) throw httpError(400, "Invalid clientId");

    const loc = parseLoc(b);
    const needs = (Array.isArray(b.needs) ? b.needs : []).filter((n) => NEEDS.includes(n));
    const peopleCount = Math.min(50, Math.max(1, parseInt(b.peopleCount, 10) || 1));
    const message = str(b.message, 200);

    const id = `${uid}_${clientId}`;
    const ref = db.collection("sos").doc(id);

    // 1) Idempotency: same clientId already stored
    if ((await ref.get()).exists) return res.json({ id, duplicate: true });

    // 2) One active SOS per person: merge new info into it
    const activeSnap = await db.collection("sos").where("uid", "==", uid).where("status", "==", "active").limit(1).get();
    if (!activeSnap.empty) {
      const doc = activeSnap.docs[0];
      const upd = { lastPingAt: FieldValue.serverTimestamp(), pingCount: FieldValue.increment(1) };
      if (loc) {
        upd.location = loc;
        upd.locationAt = Timestamp.fromDate(parseDate(b.capturedAt) || new Date());
      }
      if (needs.length) upd.needs = FieldValue.arrayUnion(...needs);
      await doc.ref.update(upd);
      return res.json({ id: doc.id, merged: true });
    }

    // 3) Create with an authoritative medical snapshot from the server
    const user = await getUser(uid);
    const triggeredAt = parseDate(b.triggeredAt) || new Date();
    const capturedAt = parseDate(b.capturedAt) || triggeredAt;
    const delayedSec = Math.max(0, Math.round((Date.now() - triggeredAt.getTime()) / 1000));

    const sos = {
      uid,
      name: user.name,
      phone: user.phone || "",
      status: "active",
      clientId,
      location: loc,
      locationAt: loc ? Timestamp.fromDate(capturedAt) : null,
      needs,
      peopleCount,
      message,
      medical: user.medical || null,
      delayedSec,
      pingCount: 0,
      triggeredAt: Timestamp.fromDate(triggeredAt),
      receivedAt: FieldValue.serverTimestamp(),
    };

    try {
      await ref.create(sos);
    } catch (e) {
      if (e.code === 6) return res.json({ id, duplicate: true }); // lost a race
      throw e;
    }

    const userUpdate = { status: "sos", statusUpdatedAt: FieldValue.serverTimestamp() };
    if (loc) {
      userUpdate.lastLocation = loc;
      userUpdate.lastLocationAt = FieldValue.serverTimestamp();
    }
    await db.collection("users").doc(uid).update(userUpdate);

    const late = delayedSec > 60 ? " (sent after reconnecting)" : "";
    await logActivity(await familyIdsOf(uid), {
      uid, name: user.name, type: "status_sos", message: `${user.name} sent an SOS!${late}`,
    });
scheduleCluster(3000);
    res.status(201).json({ id, created: true });
  } catch (err) {
    next(err);
  }
};

exports.pingSOS = async (req, res, next) => {
  try {
    const { ref, data } = await getOwnSOS(req.params.id, req.user.uid);
    if (data.status !== "active") throw httpError(409, "SOS is no longer active");
    const loc = parseLoc(req.body || {});
    if (!loc) throw httpError(400, "lat and lng are required");

    await ref.update({
      location: loc,
      locationAt: FieldValue.serverTimestamp(),
      lastPingAt: FieldValue.serverTimestamp(),
      pingCount: FieldValue.increment(1),
    });
    await db.collection("users").doc(req.user.uid).update({
      lastLocation: loc,
      lastLocationAt: FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.resolveSOS = async (req, res, next) => {
  try {
    const outcome = req.body?.outcome;
    if (!["safe", "false_alarm"].includes(outcome)) throw httpError(400, "outcome must be safe or false_alarm");

    const { ref, data } = await getOwnSOS(req.params.id, req.user.uid);
    if (data.status !== "active") return res.json({ ok: true, already: true });

    await ref.update({
      status: outcome === "safe" ? "resolved" : "cancelled",
      resolution: outcome,
      resolvedAt: FieldValue.serverTimestamp(),
    });
    await db.collection("users").doc(req.user.uid).update({
      status: "safe",
      statusUpdatedAt: FieldValue.serverTimestamp(),
    });
    await logActivity(await familyIdsOf(req.user.uid), {
      uid: req.user.uid,
      name: data.name,
      type: "status_safe",
      message: outcome === "safe" ? `${data.name} is safe. SOS resolved` : `${data.name} cancelled an SOS (false alarm)`,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.listMine = async (req, res, next) => {
  try {
    const snap = await db.collection("sos").where("uid", "==", req.user.uid).limit(50).get();
    const list = snap.docs
      .map(shape)
      .sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt))
      .slice(0, 15)
      .map(({ medical, ...rest }) => rest); // medical stays server-side for citizens' list
    res.json({ sos: list });
  } catch (err) {
    next(err);
  }
};

// For responders/commanders (used by the Command Dashboard in Step 8)
exports.listActive = async (req, res, next) => {
  try {
    const snap = await db.collection("sos").where("status", "==", "active").limit(200).get();
    res.json({ sos: snap.docs.map(shape).sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt)) });
  } catch (err) {
    next(err);
  }
};