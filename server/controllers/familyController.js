const crypto = require("crypto");
const { admin, db } = require("../config/firebaseAdmin");
const { distanceM, validCoords } = require("../utils/geo");
const { FieldValue } = require("firebase-admin/firestore");
const STATUSES = ["safe", "unknown", "sos"];
const MAX_MEMBERS = 12;
const MAX_CIRCLES = 5;
const MAX_ZONES = 5;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const httpError = (status, message) => Object.assign(new Error(message), { status });
const genCode = () =>
  Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join("");
const iso = (ts) => ts?.toDate?.().toISOString() || null;

async function getUser(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) throw httpError(404, "Profile not found");
  return snap.data();
}

async function getFamilyForMember(id, uid) {
  const ref = db.collection("families").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, "Circle not found");
  const data = snap.data();
  if (!data.memberUids.includes(uid)) throw httpError(403, "You are not a member of this circle");
  return { ref, data };
}

async function logActivity(familyIds, entry) {
  if (!familyIds.length) return;
  const batch = db.batch();
  familyIds.forEach((fid) => {
    const ref = db.collection("families").doc(fid).collection("activity").doc();
    batch.set(ref, { ...entry, at: FieldValue.serverTimestamp() });
  });
  await batch.commit();
}

/* ---------- Circles ---------- */

exports.createFamily = async (req, res, next) => {
  try {
    const name = (req.body.name || "").trim();
    if (name.length < 2 || name.length > 40) {
      throw httpError(400, "Circle name must be 2-40 characters");
    }
    const mine = await db.collection("families").where("memberUids", "array-contains", req.user.uid).get();
    if (mine.size >= MAX_CIRCLES) throw httpError(400, `You can be in up to ${MAX_CIRCLES} circles`);

    let inviteCode = null;
    for (let i = 0; i < 5 && !inviteCode; i++) {
      const code = genCode();
      const clash = await db.collection("families").where("inviteCode", "==", code).limit(1).get();
      if (clash.empty) inviteCode = code;
    }
    if (!inviteCode) throw httpError(500, "Could not generate an invite code, try again");

    const ref = db.collection("families").doc();
    await ref.set({
      name,
      ownerUid: req.user.uid,
      memberUids: [req.user.uid],
      inviteCode,
      safeZones: [],
      createdAt: FieldValue.serverTimestamp(),
    });
    const user = await getUser(req.user.uid);
    await logActivity([ref.id], { uid: user.uid, name: user.name, type: "create", message: `${user.name} created the circle` });

    res.status(201).json({ id: ref.id, name, inviteCode });
  } catch (err) {
    next(err);
  }
};

exports.joinFamily = async (req, res, next) => {
  try {
    const code = (req.body.inviteCode || "").trim().toUpperCase();
    if (code.length !== 6) throw httpError(400, "Enter the 6-character invite code");

    const q = await db.collection("families").where("inviteCode", "==", code).limit(1).get();
    if (q.empty) throw httpError(404, "No circle found for this code");
    const doc = q.docs[0];

    const mine = await db.collection("families").where("memberUids", "array-contains", req.user.uid).get();
    if (mine.size >= MAX_CIRCLES) throw httpError(400, `You can be in up to ${MAX_CIRCLES} circles`);

    await db.runTransaction(async (t) => {
      const fresh = await t.get(doc.ref);
      const f = fresh.data();
      if (f.memberUids.includes(req.user.uid)) throw httpError(409, "You are already in this circle");
      if (f.memberUids.length >= MAX_MEMBERS) throw httpError(400, "This circle is full");
      t.update(doc.ref, { memberUids: FieldValue.arrayUnion(req.user.uid) });
    });

    const user = await getUser(req.user.uid);
    await logActivity([doc.id], { uid: user.uid, name: user.name, type: "join", message: `${user.name} joined the circle` });
    res.json({ id: doc.id, name: doc.data().name });
  } catch (err) {
    next(err);
  }
};

exports.listFamilies = async (req, res, next) => {
  try {
    const snap = await db.collection("families").where("memberUids", "array-contains", req.user.uid).get();
    const families = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const uids = [...new Set(families.flatMap((f) => f.memberUids))];
    const userSnaps = uids.length
      ? await db.getAll(...uids.map((u) => db.collection("users").doc(u)))
      : [];

    const users = {};
    userSnaps.forEach((s) => {
      if (!s.exists) return;
      const u = s.data();
      users[u.uid] = {
        uid: u.uid,
        name: u.name,
        phone: u.phone || "",
        status: u.status || "unknown",
        lastLocation: u.lastLocation || null,
        lastLocationAt: iso(u.lastLocationAt),
        statusUpdatedAt: iso(u.statusUpdatedAt),
      };
    });

    res.json({
      families: families
        .map((f) => ({
          id: f.id,
          name: f.name,
          ownerUid: f.ownerUid,
          inviteCode: f.inviteCode,
          safeZones: f.safeZones || [],
          members: f.memberUids.map((u) => users[u]).filter(Boolean),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (err) {
    next(err);
  }
};

exports.leaveFamily = async (req, res, next) => {
  try {
    const { ref, data } = await getFamilyForMember(req.params.id, req.user.uid);
    const remaining = data.memberUids.filter((u) => u !== req.user.uid);

    if (remaining.length === 0) {
      await db.recursiveDelete(ref);
      return res.json({ message: "Circle deleted" });
    }
    const update = { memberUids: FieldValue.arrayRemove(req.user.uid) };
    if (data.ownerUid === req.user.uid) update.ownerUid = remaining[0];
    await ref.update(update);

    const user = await getUser(req.user.uid);
    await logActivity([ref.id], { uid: user.uid, name: user.name, type: "leave", message: `${user.name} left the circle` });
    res.json({ message: "You left the circle" });
  } catch (err) {
    next(err);
  }
};

/* ---------- Status + Location + Geofence ---------- */

function parseLoc(body) {
  if (body.lat === undefined || body.lng === undefined) return null;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!validCoords(lat, lng)) throw httpError(400, "Invalid coordinates");
  return { lat, lng, accuracy: Math.max(0, Math.round(Number(body.accuracy) || 0)) };
}

async function saveState(uid, { status, loc }) {
  const user = await getUser(uid);
  const update = {};
  let finalStatus = user.status || "unknown";
  let checkedInAt = null;

  const famSnap = await db.collection("families").where("memberUids", "array-contains", uid).get();
  const allIds = famSnap.docs.map((d) => d.id);

  if (loc) {
    update.lastLocation = loc;
    update.lastLocationAt = FieldValue.serverTimestamp();
  }

  if (status && status !== finalStatus) {
    finalStatus = status;
    update.status = status;
    update.statusUpdatedAt = FieldValue.serverTimestamp();
    const msg = {
      safe: `${user.name} marked themselves safe`,
      unknown: `${user.name} set status to unknown`,
      sos: `${user.name} sent an SOS!`,
    }[status];
    await logActivity(allIds, { uid, name: user.name, type: `status_${status}`, message: msg });
  } else if (loc && !status && finalStatus === "unknown") {
    // Geofence auto check-in (never overrides SOS)
    for (const f of famSnap.docs) {
      const zone = (f.data().safeZones || []).find((z) => distanceM(loc, z) <= z.radius);
      if (zone) {
        finalStatus = "safe";
        checkedInAt = zone.name;
        update.status = "safe";
        update.statusUpdatedAt = FieldValue.serverTimestamp();
        await logActivity([f.id], {
          uid, name: user.name, type: "checkin",
          message: `${user.name} checked in at ${zone.name}`,
        });
        break;
      }
    }
  }

  if (Object.keys(update).length) await db.collection("users").doc(uid).update(update);
  return { status: finalStatus, checkedInAt };
}

exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!STATUSES.includes(status)) throw httpError(400, "Status must be safe, unknown, or sos");
    res.json(await saveState(req.user.uid, { status, loc: parseLoc(req.body) }));
  } catch (err) {
    next(err);
  }
};

exports.updateLocation = async (req, res, next) => {
  try {
    const loc = parseLoc(req.body);
    if (!loc) throw httpError(400, "lat and lng are required");
    res.json(await saveState(req.user.uid, { loc }));
  } catch (err) {
    next(err);
  }
};

/* ---------- Activity ---------- */

exports.getActivity = async (req, res, next) => {
  try {
    const { ref } = await getFamilyForMember(req.params.id, req.user.uid);
    const snap = await ref.collection("activity").orderBy("at", "desc").limit(25).get();
    res.json({
      activity: snap.docs.map((d) => {
        const a = d.data();
        return { id: d.id, type: a.type, message: a.message, at: iso(a.at) };
      }),
    });
  } catch (err) {
    next(err);
  }
};

/* ---------- Safe zones ---------- */

exports.addZone = async (req, res, next) => {
  try {
    const { ref, data } = await getFamilyForMember(req.params.id, req.user.uid);
    if (data.ownerUid !== req.user.uid) throw httpError(403, "Only the circle owner can manage safe zones");
    if ((data.safeZones || []).length >= MAX_ZONES) throw httpError(400, `Up to ${MAX_ZONES} safe zones allowed`);

    const name = (req.body.name || "").trim();
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const radius = Number(req.body.radius);
    if (name.length < 2 || name.length > 40) throw httpError(400, "Zone name must be 2-40 characters");
    if (!validCoords(lat, lng)) throw httpError(400, "Invalid coordinates");
    if (!(radius >= 50 && radius <= 5000)) throw httpError(400, "Radius must be 50-5000 meters");

    const zone = { id: crypto.randomUUID().slice(0, 8), name, lat, lng, radius: Math.round(radius) };
    await ref.update({ safeZones: FieldValue.arrayUnion(zone) });
    res.status(201).json({ zone });
  } catch (err) {
    next(err);
  }
};

exports.removeZone = async (req, res, next) => {
  try {
    const { ref, data } = await getFamilyForMember(req.params.id, req.user.uid);
    if (data.ownerUid !== req.user.uid) throw httpError(403, "Only the circle owner can manage safe zones");
    const zones = (data.safeZones || []).filter((z) => z.id !== req.params.zoneId);
    await ref.update({ safeZones: zones });
    res.json({ message: "Zone removed" });
  } catch (err) {
    next(err);
  }
};