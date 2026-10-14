const { admin, db } = require("../config/firebaseAdmin");
const { validCoords } = require("../utils/geo");
const realtime = require("../services/realtime");
const demo = require("../services/opsDemo");

const { FieldValue } = require("firebase-admin/firestore");

const TYPES = ["rescue", "medical", "boat", "drone", "logistics"];
const STATUSES = ["available", "dispatched", "en_route", "on_scene", "returning", "offline"];
const MAX_TEAMS = 100;
const MAX_MEMBERS = 20;

const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? "").trim().slice(0, max);

async function actor(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) throw httpError(404, "Profile not found");
  return snap.data();
}

async function getTeam(id) {
  const ref = db.collection("teams").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, "Team not found");
  return { ref, data: snap.data() };
}

exports.create = async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = str(b.name, 40);
    const size = Number(b.size ?? 4);
    if (name.length < 2) throw httpError(400, "Team name must be 2-40 characters");
    if (!TYPES.includes(b.type)) throw httpError(400, "Invalid team type");
    if (!Number.isInteger(size) || size < 1 || size > 50) throw httpError(400, "Team size must be 1-50");
    if ((await db.collection("teams").limit(MAX_TEAMS + 1).get()).size >= MAX_TEAMS) throw httpError(400, "Team limit reached");

    const user = await actor(req.user.uid);
    const ref = db.collection("teams").doc();
    await ref.set({
      name, type: b.type, size, status: "available", memberUids: [], note: "", assignedIncidentId: null,
      location: null, locationAt: null, demo: false,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedByName: user.name,
    });
    res.status(201).json({ id: ref.id });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { ref, data } = await getTeam(req.params.id);
    const b = req.body || {};
    const isCmd = req.user.role === "commander";
    const member = (data.memberUids || []).includes(req.user.uid);
    if (!isCmd && !member) throw httpError(403, "You can only update your own team");
    if (!isCmd && ["name", "type", "size"].some((k) => b[k] !== undefined)) throw httpError(403, "Only commanders can edit team details");

    const patch = {};
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw httpError(400, "Invalid status");
      patch.status = b.status;
      if (b.status === "available") patch.assignedIncidentId = null;
      demo.stopMover(req.params.id);
    }
    if (b.note !== undefined) patch.note = str(b.note, 150);
    if (isCmd) {
      if (b.name !== undefined) {
        const n = str(b.name, 40);
        if (n.length < 2) throw httpError(400, "Team name must be 2-40 characters");
        patch.name = n;
      }
      if (b.type !== undefined) {
        if (!TYPES.includes(b.type)) throw httpError(400, "Invalid team type");
        patch.type = b.type;
      }
      if (b.size !== undefined) {
        const s = Number(b.size);
        if (!Number.isInteger(s) || s < 1 || s > 50) throw httpError(400, "Team size must be 1-50");
        patch.size = s;
      }
    }
    if (!Object.keys(patch).length) throw httpError(400, "Nothing to update");

    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedByName = (await actor(req.user.uid)).name;
    await ref.update(patch);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const { ref, data } = await getTeam(req.params.id);
    demo.stopMover(req.params.id);
    const batch = db.batch();
    (data.memberUids || []).forEach((uid) => batch.update(db.collection("users").doc(uid), { teamId: FieldValue.delete() }));
    batch.delete(ref);
    await batch.commit();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.join = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { ref, data } = await getTeam(req.params.id);
    const user = await actor(uid);
    const members = data.memberUids || [];
    if (!members.includes(uid) && members.length >= MAX_MEMBERS) throw httpError(400, "This team is full");

    const batch = db.batch();
    if (user.teamId && user.teamId !== ref.id) {
      const old = db.collection("teams").doc(user.teamId);
      if ((await old.get()).exists) batch.update(old, { memberUids: FieldValue.arrayRemove(uid) });
    }
    batch.update(ref, { memberUids: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() });
    batch.update(db.collection("users").doc(uid), { teamId: ref.id });
    await batch.commit();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.leave = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const user = await actor(uid);
    const batch = db.batch();
    if (user.teamId) {
      const t = db.collection("teams").doc(user.teamId);
      if ((await t.get()).exists) batch.update(t, { memberUids: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() });
    }
    batch.update(db.collection("users").doc(uid), { teamId: FieldValue.delete() });
    await batch.commit();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// Live telemetry from a responder's phone: broadcast directly, never refetch
const lastPing = new Map();
exports.location = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!validCoords(lat, lng)) throw httpError(400, "Invalid coordinates");

    const now = Date.now();
    if (now - (lastPing.get(uid) || 0) < 5000) return res.json({ ok: true, skipped: true });
    lastPing.set(uid, now);

    const user = await actor(uid);
    if (!user.teamId) throw httpError(400, "Join a team first to share your location");

    const location = { lat, lng, accuracy: Math.max(0, Math.round(Number(req.body?.accuracy) || 0)) };
    try {
      await db.collection("teams").doc(user.teamId).update({ location, locationAt: FieldValue.serverTimestamp() });
    } catch (e) {
      if (e.code === 5) {
        await db.collection("users").doc(uid).update({ teamId: FieldValue.delete() });
        throw httpError(404, "Your team no longer exists");
      }
      throw e;
    }
    realtime.emitOps("team:pos", { id: user.teamId, location, at: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// Commander: assign a team to an open incident (or unassign with incidentId = null)
exports.assign = async (req, res, next) => {
  try {
    const { ref, data: team } = await getTeam(req.params.id);
    const incidentId = req.body?.incidentId || null;
    const by = (await actor(req.user.uid)).name;

    if (!incidentId) {
      demo.stopMover(ref.id);
      await ref.update({ assignedIncidentId: null, status: "available", updatedAt: FieldValue.serverTimestamp(), updatedByName: by });
      return res.json({ ok: true });
    }

    const incRef = db.collection("incidents").doc(incidentId);
    const inc = await incRef.get();
    if (!inc.exists || inc.data().status !== "open") throw httpError(404, "That incident is no longer open");
    const i = inc.data();

    await ref.update({
      assignedIncidentId: incidentId,
      status: team.demo ? "en_route" : "dispatched",
      updatedAt: FieldValue.serverTimestamp(), updatedByName: by,
    });
    if (i.ops !== "dispatched") {
      await incRef.update({ ops: "dispatched", hasNewActivity: false, opsByName: by, opsAt: FieldValue.serverTimestamp() });
    }
    if (team.demo && team.location && i.centroid) demo.addMover(ref.id, team.location, i.centroid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};