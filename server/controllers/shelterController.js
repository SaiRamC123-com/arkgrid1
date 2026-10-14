const { admin, db, FieldValue, Timestamp } = require("../config/firebaseAdmin");
const { validCoords } = require("../utils/geo");

const TYPES = ["shelter", "hospital", "relief"];
const RES_KEYS = ["water", "food", "medical", "power"];
const RES_LEVELS = ["ok", "low", "out"];
const PHONE_RE = /^[+\d\s()-]{6,20}$/;

const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const iso = (ts) => ts?.toDate?.().toISOString() || null;

const shape = (d) => {
  const s = d.data();
  const pct = s.capacity > 0 ? Math.round(((s.occupied || 0) / s.capacity) * 100) : null;
  let availability = "open";
  if (s.status === "closed") availability = "closed";
  else if (pct !== null) availability = pct >= 100 ? "full" : pct >= 75 ? "limited" : "open";

  return {
    id: d.id,
    type: s.type,
    name: s.name,
    address: s.address || "",
    phone: s.phone || "",
    lat: s.lat,
    lng: s.lng,
    capacity: s.capacity || 0,
    occupied: s.occupied || 0,
    occupancyPct: pct,
    availability,
    status: s.status || "open",
    resources: s.resources || {},
    demo: !!s.demo,
    updatedAt: iso(s.updatedAt),
    updatedByName: s.updatedByName || "",
  };
};

async function actorName(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? snap.data().name : "Unknown";
}

function clean(b, { partial }) {
  const out = {};
  const has = (k) => b[k] !== undefined;

  if (!partial || has("name")) {
    const name = str(b.name, 80);
    if (name.length < 2) throw httpError(400, "Name must be 2-80 characters");
    out.name = name;
  }
  if (!partial || has("type")) {
    if (!TYPES.includes(b.type)) throw httpError(400, "Invalid facility type");
    out.type = b.type;
  }
  if (!partial || has("lat") || has("lng")) {
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!validCoords(lat, lng)) throw httpError(400, "Invalid coordinates");
    out.lat = lat;
    out.lng = lng;
  }
  if (has("address")) out.address = str(b.address, 120);
  if (has("phone")) {
    const phone = str(b.phone, 20);
    if (phone && !PHONE_RE.test(phone)) throw httpError(400, "Invalid phone number");
    out.phone = phone;
  }
  if (!partial || has("capacity")) {
    const c = Number(b.capacity ?? 0);
    if (!Number.isInteger(c) || c < 0 || c > 100000) throw httpError(400, "Capacity must be a whole number 0-100000");
    out.capacity = c;
  }
  if (!partial || has("occupied")) {
    const o = Number(b.occupied ?? 0);
    if (!Number.isInteger(o) || o < 0) throw httpError(400, "Occupied must be a whole number, 0 or more");
    out.occupied = o;
  }
  if (has("status")) {
    if (!["open", "closed"].includes(b.status)) throw httpError(400, "Status must be open or closed");
    out.status = b.status;
  }
  if (has("resources")) {
    const r = {};
    RES_KEYS.forEach((k) => {
      const lvl = b.resources?.[k] ?? "ok";
      if (!RES_LEVELS.includes(lvl)) throw httpError(400, `Invalid level for ${k}`);
      r[k] = lvl;
    });
    out.resources = r;
  }
  return out;
}

function checkCapacity(merged) {
  if (merged.capacity === 0) merged.occupied = 0;
  else if (merged.occupied > merged.capacity) throw httpError(400, "Occupied cannot exceed capacity");
}

exports.list = async (req, res, next) => {
  try {
    const snap = await db.collection("shelters").limit(500).get();
    res.json({ shelters: snap.docs.map(shape) });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const data = clean(req.body || {}, { partial: false });
    checkCapacity(data);
    const name = await actorName(req.user.uid);
    const ref = db.collection("shelters").doc();
    await ref.set({
      address: "",
      phone: "",
      status: "open",
      resources: { water: "ok", food: "ok", medical: "ok", power: "ok" },
      ...data,
      demo: false,
      createdBy: req.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByName: name,
    });
    res.status(201).json({ shelter: shape(await ref.get()) });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const ref = db.collection("shelters").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw httpError(404, "Facility not found");

    const patch = clean(req.body || {}, { partial: true });
    if (!Object.keys(patch).length) throw httpError(400, "Nothing to update");
    const merged = { ...snap.data(), ...patch };
    checkCapacity(merged);
    patch.occupied = merged.occupied;

    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedByName = await actorName(req.user.uid);
    await ref.update(patch);
    res.json({ shelter: shape(await ref.get()) });
  } catch (err) {
    next(err);
  }
};

// Concurrency-safe +/- occupancy (several responders can tap at once)
exports.adjustOccupancy = async (req, res, next) => {
  try {
    const delta = Number(req.body?.delta);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 500) {
      throw httpError(400, "delta must be a non-zero whole number (max 500)");
    }
    const name = await actorName(req.user.uid);
    const ref = db.collection("shelters").doc(req.params.id);

    await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) throw httpError(404, "Facility not found");
      const s = snap.data();
      if (!s.capacity) throw httpError(400, "This facility does not track capacity");
      const next = Math.min(s.capacity, Math.max(0, (s.occupied || 0) + delta));
      t.update(ref, { occupied: next, updatedAt: FieldValue.serverTimestamp(), updatedByName: name });
    });
    res.json({ shelter: shape(await ref.get()) });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const ref = db.collection("shelters").doc(req.params.id);
    if (!(await ref.get()).exists) throw httpError(404, "Facility not found");
    await ref.delete();
    res.json({ message: "Facility removed" });
  } catch (err) {
    next(err);
  }
};

/* ---------- Demo data (commander) ---------- */

const ok = { water: "ok", food: "ok", medical: "ok", power: "ok" };
// [type, name, capacity, occupied, dLat, dLng, resources]
const DEMO = [
  ["shelter", "Demo Community Hall Shelter", 420, 318, 0.010, 0.012, { ...ok, medical: "low" }],
  ["shelter", "Demo School Relief Shelter", 600, 590, -0.014, 0.006, { water: "low", food: "low", medical: "out", power: "ok" }],
  ["shelter", "Demo Stadium Evacuation Center", 1500, 640, 0.022, -0.018, ok],
  ["shelter", "Demo Temple Complex Shelter", 250, 250, -0.020, -0.022, { water: "ok", food: "low", medical: "out", power: "out" }],
  ["hospital", "Demo District Hospital", 220, 171, 0.006, -0.010, ok],
  ["hospital", "Demo Trauma Care Center", 90, 52, -0.008, 0.016, ok],
  ["hospital", "Demo Rural Health Clinic", 30, 29, 0.030, 0.020, { water: "ok", food: "ok", medical: "low", power: "low" }],
  ["relief", "Demo Relief Distribution Point A", 0, 0, 0.003, 0.004, { ...ok, food: "low" }],
  ["relief", "Demo Relief Distribution Point B", 0, 0, -0.004, -0.009, { water: "out", food: "ok", medical: "ok", power: "ok" }],
];

exports.seedDemo = async (req, res, next) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!validCoords(lat, lng)) throw httpError(400, "Valid lat and lng are required");

    const existing = await db.collection("shelters").where("demo", "==", true).limit(1).get();
    if (!existing.empty) throw httpError(409, "Demo data already exists. Clear it first");

    const name = await actorName(req.user.uid);
    const batch = db.batch();
    DEMO.forEach(([type, nm, capacity, occupied, dLat, dLng, resources]) => {
      batch.set(db.collection("shelters").doc(), {
        type, name: nm, address: "Demo data", phone: "",
        lat: lat + dLat, lng: lng + dLng,
        capacity, occupied, status: "open", resources,
        demo: true, createdBy: req.user.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedByName: name,
      });
    });
    await batch.commit();
    res.status(201).json({ created: DEMO.length });
  } catch (err) {
    next(err);
  }
};

exports.clearDemo = async (req, res, next) => {
  try {
    const snap = await db.collection("shelters").where("demo", "==", true).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    res.json({ removed: snap.size });
  } catch (err) {
    next(err);
  }
};