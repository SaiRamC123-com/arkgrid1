const { admin, db } = require("../config/firebaseAdmin");
const { validCoords } = require("../utils/geo");

const { FieldValue } = require("firebase-admin/firestore");

const KINDS = ["power", "water", "telecom", "bridge", "hospital_power", "fuel"];
const STATUSES = ["operational", "degraded", "down"];

const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? "").trim().slice(0, max);

async function actorName(uid) {
  const s = await db.collection("users").doc(uid).get();
  return s.exists ? s.data().name : "Staff";
}

exports.create = async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = str(b.name, 60);
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    const status = b.status || "operational";
    if (name.length < 2) throw httpError(400, "Name must be 2-60 characters");
    if (!KINDS.includes(b.kind)) throw httpError(400, "Invalid infrastructure type");
    if (!STATUSES.includes(status)) throw httpError(400, "Invalid status");
    if (!validCoords(lat, lng)) throw httpError(400, "A location is required");
    if ((await db.collection("infra").limit(201).get()).size >= 200) throw httpError(400, "Infrastructure limit reached");

    const by = await actorName(req.user.uid);
    const ref = db.collection("infra").doc();
    await ref.set({
      name, kind: b.kind, status, lat, lng, note: str(b.note, 150), demo: false,
      history: [{ status, at: Timestamp.now(), by }],
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedByName: by,
    });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const ref = db.collection("infra").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw httpError(404, "Not found");
    const cur = snap.data();
    const b = req.body || {};
    const isCmd = req.user.role === "commander";
    if (!isCmd && ["name", "kind", "lat", "lng"].some((k) => b[k] !== undefined)) throw httpError(403, "Only commanders can edit details");

    const by = await actorName(req.user.uid);
    const patch = {};
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw httpError(400, "Invalid status");
      patch.status = b.status;
      if (b.status !== cur.status) patch.history = [...(cur.history || []).slice(-9), { status: b.status, at: Timestamp.now(), by }];
    }
    if (b.note !== undefined) patch.note = str(b.note, 150);
    if (isCmd) {
      if (b.name !== undefined) {
        const n = str(b.name, 60);
        if (n.length < 2) throw httpError(400, "Name must be 2-60 characters");
        patch.name = n;
      }
      if (b.kind !== undefined) {
        if (!KINDS.includes(b.kind)) throw httpError(400, "Invalid infrastructure type");
        patch.kind = b.kind;
      }
      if (b.lat !== undefined || b.lng !== undefined) {
        if (!validCoords(Number(b.lat), Number(b.lng))) throw httpError(400, "Invalid coordinates");
        patch.lat = Number(b.lat);
        patch.lng = Number(b.lng);
      }
    }
    if (!Object.keys(patch).length) throw httpError(400, "Nothing to update");

    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedByName = by;
    await ref.update(patch);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const ref = db.collection("infra").doc(req.params.id);
    if (!(await ref.get()).exists) throw httpError(404, "Not found");
    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};