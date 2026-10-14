const crypto = require("crypto");
const { db, FieldValue } = require("../config/firebaseAdmin");
const getBucket = require("../config/storage");
const { validCoords } = require("../utils/geo");
const { checkRate } = require("../utils/rateLimit");
const { classifyReport } = require("../services/groqService");
const { scheduleCluster } = require("../services/clusterService");

const TYPES = ["submerged_road", "structural", "powerline", "stranded", "other"];
const STATUSES = ["unverified", "verified", "resolved", "rejected"];
const NEEDED = 2; // independent citizen confirmations to auto-verify
const WINDOW_MS = 72 * 3600 * 1000;

const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const iso = (ts) => ts?.toDate?.().toISOString() || null;

function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function uploadPhoto(buf, mime, uid) {
  const bucket = getBucket();
  if (!bucket) throw new Error("Storage bucket not configured");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mime];
  const path = `reports/${uid}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const token = crypto.randomUUID();
  await bucket.file(path).save(buf, {
    contentType: mime,
    resumable: false,
    metadata: { cacheControl: "public,max-age=31536000", metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

const shape = (d, uid) => {
  const s = d.data();
  const conf = s.confirmedBy || [];
  return {
    id: d.id,
    type: s.type,
    description: s.description || "",
    lat: s.lat,
    lng: s.lng,
    photoUrl: s.photoUrl || null,
    status: s.status,
    authorName: s.authorName || "Citizen",
    mine: s.uid === uid,
    confirmedByMe: conf.includes(uid),
    confirmCount: conf.length,
    confirmationsNeeded: NEEDED,
    verifiedBy: s.verifiedByRole || null,
    aiStatus: s.aiStatus || "failed",
    ai: s.ai || null,
    incidentCode: s.incidentId ? s.incidentId.slice(0, 5).toUpperCase() : null,
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  };
};

exports.create = async (req, res, next) => {
  try {
    const b = req.body || {};
    const uid = req.user.uid;
    const staff = req.user.role !== "citizen";

    if (!TYPES.includes(b.type)) throw httpError(400, "Choose a report type");
    const description = str(b.description, 300);
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!validCoords(lat, lng)) throw httpError(400, "A location is required");
    const file = req.file;
    if (!description && !file) throw httpError(400, "Add a photo or a short description");

    let mime = null;
    if (file) {
      mime = sniff(file.buffer);
      if (!mime) throw httpError(400, "That file is not a valid photo");
    }

    await checkRate(uid, "reports", 5, 10 * 60 * 1000, "You're sending reports too quickly. Please wait a few minutes.");

    let photoUrl = null;
    let photoFailed = false;
    if (file) {
      try {
        photoUrl = await uploadPhoto(file.buffer, mime, uid);
      } catch (e) {
        console.error("Photo upload failed:", e.message);
        photoFailed = true;
      }
    }

    const user = (await db.collection("users").doc(uid).get()).data();
    const ref = db.collection("reports").doc();
    await ref.set({
      uid,
      authorName: user?.name || "Citizen",
      type: b.type,
      description,
      lat,
      lng,
      photoUrl,
      status: staff ? "verified" : "unverified",
      verifiedByRole: staff ? req.user.role : null,
      confirmedBy: [],
      aiStatus: "pending",
      ai: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({ report: shape(await ref.get(), uid), photoFailed });
    scheduleCluster(3000);

    // AI classification runs in the background (assist only, never blocks the report)
    classifyReport({ type: b.type, description, photo: file && mime ? { buffer: file.buffer, mime } : null })
      .then((ai) => ref.update({ ai, aiStatus: "done" }).then(() => scheduleCluster(3000)))
      .catch((e) => {
        console.error("AI classify failed:", e.message);
        return ref.update({ aiStatus: "failed" }).catch(() => {});
      });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const snap = await db.collection("reports").limit(300).get(); // no orderBy, so no index is needed
    const now = Date.now();
    const reports = [];
    for (const d of snap.docs) {
      try {
        const s = d.data();
        const created = s.createdAt?.toMillis?.() || now;
        const updated = s.updatedAt?.toMillis?.() || created;
        if (now - created > WINDOW_MS) continue;
        if (s.status === "rejected") continue;
        if (s.status === "resolved" && now - updated > 3 * 3600 * 1000) continue;
        reports.push(shape(d, req.user.uid));
      } catch (e) {
        console.warn("Skipping bad report", d.id, e.message);
      }
    }
    reports.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    res.json({ reports });
  } catch (err) {
    next(err);
  }
};

exports.confirm = async (req, res, next) => {
  try {
    const ref = db.collection("reports").doc(req.params.id);
    const staff = req.user.role !== "citizen";

    await db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) throw httpError(404, "Report not found");
      const s = snap.data();
      if (["resolved", "rejected"].includes(s.status)) throw httpError(409, "This report is closed");
      if (s.uid === req.user.uid) throw httpError(403, "You cannot confirm your own report");
      const conf = s.confirmedBy || [];
      if (conf.includes(req.user.uid)) throw httpError(409, "You already confirmed this report");

      const next = [...conf, req.user.uid];
      const upd = { confirmedBy: next, updatedAt: FieldValue.serverTimestamp() };
      if (s.status === "unverified" && (staff || next.length >= NEEDED)) {
        upd.status = "verified";
        upd.verifiedByRole = staff ? req.user.role : "community";
      }
      t.update(ref, upd);
    });
    res.json({ report: shape(await ref.get(), req.user.uid) });
  } catch (err) {
    next(err);
  }
};

exports.setStatus = async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!STATUSES.includes(status)) throw httpError(400, "Invalid status");
    const ref = db.collection("reports").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw httpError(404, "Report not found");

    const staff = req.user.role !== "citizen";
    if (!staff && !(snap.data().uid === req.user.uid && status === "resolved")) {
      throw httpError(403, "You can only mark your own report as resolved");
    }
    const upd = { status, updatedAt: FieldValue.serverTimestamp() };
    if (status === "verified") upd.verifiedByRole = req.user.role;
    await ref.update(upd);
    res.json({ report: shape(await ref.get(), req.user.uid) });
  } catch (err) {
    next(err);
  }
};