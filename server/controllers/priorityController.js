const { admin, db } = require("../config/firebaseAdmin");
const realtime = require("../services/realtime");
const { getRanking, KEYS } = require("../services/triageService");

const { FieldValue } = require("firebase-admin/firestore");
const FLOWS = ["still", "slow", "moderate", "fast"];
const httpError = (status, message) => Object.assign(new Error(message), { status });

const actorName = async (uid) => (await db.collection("users").doc(uid).get()).data()?.name || "Staff";

exports.get = async (req, res, next) => {
  try {
    res.json(await getRanking());
  } catch (err) {
    next(err);
  }
};

exports.saveWeights = async (req, res, next) => {
  try {
    const w = {};
    let sum = 0;
    for (const k of KEYS) {
      const v = Number(req.body?.weights?.[k]);
      if (!(v >= 0 && v <= 1)) throw httpError(400, `Invalid weight for ${k}`);
      w[k] = v;
      sum += v;
    }
    if (sum <= 0) throw httpError(400, "At least one weight must be above zero");
    KEYS.forEach((k) => (w[k] = Number((w[k] / sum).toFixed(3))));
    await db.collection("meta").doc("triageWeights").set({
      weights: w, updatedByName: await actorName(req.user.uid), updatedAt: FieldValue.serverTimestamp(),
    });
    realtime.invalidate("priority");
    res.json({ weights: w });
  } catch (err) {
    next(err);
  }
};

exports.resetWeights = async (req, res, next) => {
  try {
    await db.collection("meta").doc("triageWeights").delete();
    realtime.invalidate("priority");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// Responder's assessment of how fast the water is moving at the incident
exports.setFlow = async (req, res, next) => {
  try {
    const flow = req.body?.flow ?? null;
    if (flow !== null && !FLOWS.includes(flow)) throw httpError(400, "Flow must be still, slow, moderate or fast");
    const ref = db.collection("incidents").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().status !== "open") throw httpError(404, "Open incident not found");
    await ref.update(
      flow
        ? { flow, flowBy: await actorName(req.user.uid), flowAt: FieldValue.serverTimestamp() }
        : { flow: FieldValue.delete(), flowBy: FieldValue.delete(), flowAt: FieldValue.delete(), flowDemo: FieldValue.delete() }
    );
    realtime.invalidate("priority");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

/* Demo inputs: medical profiles on demo SOS + assessed flow on the biggest incidents */
const MED = [
  { bloodGroup: "O+", mobility: "limited", vulnerabilities: ["child", "elderly"], conditions: "Asthma", allergies: "", medications: "Inhaler", contacts: [] },
  { bloodGroup: "A-", mobility: "wheelchair", vulnerabilities: ["disability"], conditions: "", allergies: "Penicillin", medications: "", contacts: [] },
  { bloodGroup: "B+", mobility: "none", vulnerabilities: ["pregnant"], conditions: "", allergies: "", medications: "", contacts: [] },
];

exports.seedDemo = async (req, res, next) => {
  try {
    const incs = await db.collection("incidents").where("status", "==", "open").limit(50).get();
    if (incs.empty) throw httpError(409, "No open incidents. Load the demo burst on the Incident Clusters page first");
    const top = incs.docs.sort((a, b) => (b.data().memberKeys || []).length - (a.data().memberKeys || []).length).slice(0, 3);
    const sos = await db.collection("sos").where("demo", "==", true).get();

    const batch = db.batch();
    ["fast", "moderate", "slow"].forEach((f, i) => top[i] && batch.update(top[i].ref, { flow: f, flowBy: "Demo", flowAt: FieldValue.serverTimestamp(), flowDemo: true }));
    sos.docs.sort((a, b) => a.id.localeCompare(b.id)).forEach((d, i) => batch.update(d.ref, { medical: MED[i % MED.length] }));
    await batch.commit();
    realtime.invalidate("priority");
    res.status(201).json({ incidents: top.length, sos: sos.size });
  } catch (err) {
    next(err);
  }
};

exports.clearDemo = async (req, res, next) => {
  try {
    const [incs, sos] = await Promise.all([
      db.collection("incidents").where("flowDemo", "==", true).get(),
      db.collection("sos").where("demo", "==", true).get(),
    ]);
    const batch = db.batch();
    incs.docs.forEach((d) => batch.update(d.ref, { flow: FieldValue.delete(), flowBy: FieldValue.delete(), flowAt: FieldValue.delete(), flowDemo: FieldValue.delete() }));
    sos.docs.forEach((d) => batch.update(d.ref, { medical: null }));
    await batch.commit();
    realtime.invalidate("priority");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};