const { db } = require("../config/firebaseAdmin");

// Per-user sliding window stored in Firestore (works across server restarts)
exports.checkRate = async (uid, key, max, windowMs, message) => {
  const ref = db.collection("rateLimits").doc(`${uid}_${key}`);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const now = Date.now();
    const recent = (snap.exists ? snap.data().t || [] : []).filter((x) => now - x < windowMs);
    if (recent.length >= max) throw Object.assign(new Error(message), { status: 429 });
    t.set(ref, { t: [...recent, now] });
  });
};