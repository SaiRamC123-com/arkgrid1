const { admin, db } = require("../config/firebaseAdmin");
const { validCoords, distanceM } = require("../utils/geo");
const { checkRate } = require("../utils/rateLimit");

const { FieldValue } = require("firebase-admin/firestore");
const SEV = ["watch", "warning", "evacuate"];
const RANK = { watch: 0, warning: 1, evacuate: 2 };
const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const iso = (ts) => ts?.toDate?.().toISOString() || null;

const shape = (d) => {
  const s = d.data();
  return {
    id: d.id, title: s.title, message: s.message, severity: s.severity, scope: s.scope, center: s.center || null,
    radiusM: s.radiusM || null, issuedByName: s.issuedByName, issuedAt: iso(s.issuedAt), expiresAt: iso(s.expiresAt),
  };
};

exports.list = async (req, res, next) => {
  try {
    const all = req.user.role !== "citizen" && req.query.all === "1";
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    const loc = validCoords(lat, lng) ? { lat, lng } : null;
    const snap = await db.collection("advisories").where("status", "==", "active").limit(100).get();
    const now = Date.now();
    const advisories = snap.docs
      .filter((d) => d.data().expiresAt?.toMillis?.() > now)
      .filter((d) => {
        const a = d.data();
        return all || a.scope === "all" || (loc && a.center && distanceM(loc, a.center) <= a.radiusM);
      })
      .map(shape)
      .sort((a, b) => RANK[b.severity] - RANK[a.severity] || Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
    res.json({ advisories });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.confirm !== true) throw httpError(400, "Confirm that this advisory has been reviewed and authorised");
    if (!SEV.includes(b.severity)) throw httpError(400, "Choose a severity");
    const title = str(b.title, 80), message = str(b.message, 500);
    if (title.length < 3) throw httpError(400, "Title must be at least 3 characters");
    if (message.length < 10) throw httpError(400, "Message must be at least 10 characters");
    const hours = Number(b.hours ?? 6);
    if (!(hours >= 1 && hours <= 48)) throw httpError(400, "Duration must be 1-48 hours");

    const doc = { title, message, severity: b.severity, status: "active" };
    if (b.scope === "all") doc.scope = "all";
    else {
      const lat = Number(b.lat), lng = Number(b.lng), radiusM = Number(b.radiusM);
      if (!validCoords(lat, lng)) throw httpError(400, "An area centre is required");
      if (!(radiusM >= 500 && radiusM <= 100000)) throw httpError(400, "Radius must be 0.5-100 km");
      Object.assign(doc, { scope: "area", center: { lat, lng }, radiusM: Math.round(radiusM) });
    }

    const active = await db.collection("advisories").where("status", "==", "active").limit(21).get();
    if (active.docs.filter((d) => d.data().expiresAt?.toMillis?.() > Date.now()).length >= 20) throw httpError(400, "Too many active advisories. Withdraw some first");
    await checkRate(req.user.uid, "advisories", 10, 3600 * 1000, "You have issued many advisories this hour. Try again later.");

    const user = (await db.collection("users").doc(req.user.uid).get()).data();
    const ref = db.collection("advisories").doc();
    await ref.set({
      ...doc, issuedBy: req.user.uid, issuedByName: user?.name || "Commander",
      issuedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + hours * 3600e3),
    });
    res.status(201).json({ advisory: shape(await ref.get()) });
  } catch (err) {
    next(err);
  }
};

exports.withdraw = async (req, res, next) => {
  try {
    const ref = db.collection("advisories").doc(req.params.id);
    if (!(await ref.get()).exists) throw httpError(404, "Advisory not found");
    await ref.update({ status: "withdrawn", withdrawnAt: FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};