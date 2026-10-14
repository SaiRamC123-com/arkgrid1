const { admin, db } = require("../config/firebaseAdmin");
const realtime = require("../services/realtime");
const { getCached } = require("./simController");

const { FieldValue } = require("firebase-admin/firestore");
const httpError = (status, message) => Object.assign(new Error(message), { status });
const iso = (ts) => ts?.toDate?.().toISOString() || null;

exports.get = async (req, res, next) => {
  try {
    const snap = await db.collection("meta").doc("safetyScenario").get();
    if (!snap.exists) return res.json({ published: false });
    const s = snap.data();
    const active = s.expiresAt?.toMillis?.() > Date.now();
    res.json({
      published: active, expired: !active, publishedByName: s.publishedByName, publishedAt: iso(s.publishedAt),
      expiresAt: iso(s.expiresAt), params: s.params, warnings: s.warnings || [],
    });
  } catch (err) {
    next(err);
  }
};

// Publishes a server-held simulation (never client-supplied cell data) as the live safety overlay
exports.publish = async (req, res, next) => {
  try {
    const r = getCached(String(req.body?.simId || ""));
    if (!r) throw httpError(404, "That simulation has expired. Run it again, then publish");
    if (r.mode !== "surge") throw httpError(400, "Only water-surge scenarios can be published as a safety overlay");
    const hours = Number(req.body?.hours ?? 6);
    if (!(hours >= 1 && hours <= 24)) throw httpError(400, "Overlay duration must be 1-24 hours");

    const user = (await db.collection("users").doc(req.user.uid).get()).data();
    await db.collection("meta").doc("safetyScenario").set({
      mode: "surge", bounds: r.bounds, cell: r.cell, grid: r.grid,
      tMin: r.cells.map((c) => (c.t == null ? -1 : c.t)), status: r.cells.map((c) => c.status),
      params: { ...r.scenario.surge, source: r.source, summary: r.summary }, warnings: r.warnings,
      publishedByName: user?.name || "Commander", publishedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + hours * 3600e3),
    });
    realtime.invalidate("safety");
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.clear = async (req, res, next) => {
  try {
    await db.collection("meta").doc("safetyScenario").delete();
    realtime.invalidate("safety");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};