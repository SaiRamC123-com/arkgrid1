const { admin, db } = require("../config/firebaseAdmin");
const { RES, DEFAULT_RATES, DEFAULT_TH, loadConfig, analyze } = require("../utils/logistics");

const { FieldValue } = require("firebase-admin/firestore");

const httpError = (status, message) => Object.assign(new Error(message), { status });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const iso = (ts) => ts?.toDate?.().toISOString() || null;
const actor = async (uid) => (await db.collection("users").doc(uid).get()).data()?.name || "Staff";

exports.get = async (req, res, next) => {
  try {
    const cfg = await loadConfig();
    const surgePct = clamp(Number(req.query.surgePct) || 0, 0, 100);
    const th = { ...cfg.thresholds };
    if (req.query.targetH) th.targetH = clamp(Number(req.query.targetH) || th.targetH, 12, 120);

    const snap = await db.collection("shelters").limit(500).get();
    const facs = snap.docs.map((d) => {
      const s = d.data();
      return {
        id: d.id, name: s.name, type: s.type, lat: s.lat, lng: s.lng, capacity: s.capacity || 0, occupied: s.occupied || 0,
        status: s.status || "open", inventory: s.inventory || null, inventoryAt: iso(s.inventoryUpdatedAt),
        inventoryBy: s.inventoryUpdatedByName || null, demo: !!s.demo,
      };
    });
    res.json({
      ...analyze(facs, cfg.rates, th, surgePct), rates: cfg.rates, thresholds: th,
      defaults: { rates: DEFAULT_RATES, thresholds: DEFAULT_TH }, custom: cfg.custom, by: cfg.by,
      surgePct, generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

exports.setInventory = async (req, res, next) => {
  try {
    const ref = db.collection("shelters").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw httpError(404, "Facility not found");
    const patch = {};
    RES.forEach((r) => {
      if (req.body?.[r] === undefined) return;
      const v = Number(req.body[r]);
      if (!Number.isFinite(v) || v < 0 || v > 1e7) throw httpError(400, `Invalid ${r} quantity`);
      patch[`inventory.${r}`] = Math.round(v * 100) / 100;
    });
    if (!Object.keys(patch).length) throw httpError(400, "Nothing to update");
    if (!snap.data().inventory && Object.keys(patch).length < RES.length) throw httpError(400, "Enter all three quantities the first time");
    patch.inventoryUpdatedAt = FieldValue.serverTimestamp();
    patch.inventoryUpdatedByName = await actor(req.user.uid);
    await ref.update(patch);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.saveConfig = async (req, res, next) => {
  try {
    const r = req.body?.rates || {}, t = req.body?.thresholds || {};
    const rates = {}, thresholds = {};
    const chk = (v, lo, hi, name) => { const n = Number(v); if (!(n >= lo && n <= hi)) throw httpError(400, `${name} is out of range`); return n; };
    RES.forEach((k) => (rates[k] = chk(r[k], 0, 1000, `${k} rate`)));
    thresholds.warnH = chk(t.warnH, 2, 240, "Warning threshold");
    thresholds.critH = chk(t.critH, 1, 120, "Critical threshold");
    thresholds.targetH = chk(t.targetH, 12, 120, "Target runway");
    thresholds.maxKm = chk(t.maxKm, 1, 300, "Maximum transfer distance");
    if (thresholds.critH >= thresholds.warnH) throw httpError(400, "Critical must be below warning");
    if (thresholds.targetH <= thresholds.warnH) throw httpError(400, "Target runway must exceed the warning threshold");
    await db.collection("meta").doc("logisticsConfig").set({ rates, thresholds, updatedByName: await actor(req.user.uid), updatedAt: FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.resetConfig = async (req, res, next) => {
  try {
    await db.collection("meta").doc("logisticsConfig").delete();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const HOURS = [60, 6, 30, 14, 90, 20, 10];
const MULT = { water: 1, rations: 0.8, medical: 1.6 };
const RELIEF = [{ water: 6000, rations: 9000, medical: 100 }, { water: 400, rations: 12000, medical: 15 }];

exports.seedDemo = async (req, res, next) => {
  try {
    const cfg = await loadConfig();
    const snap = await db.collection("shelters").where("demo", "==", true).get();
    if (snap.empty) throw httpError(409, "No demo facilities. Load demo data on the Shelters page first");
    const docs = snap.docs.sort((a, b) => a.data().name.localeCompare(b.data().name));
    let ci = 0, ri = 0;
    const batch = db.batch();
    const by = await actor(req.user.uid);
    docs.forEach((d) => {
      const s = d.data();
      let inv;
      if (s.type === "relief") inv = RELIEF[ri++ % RELIEF.length];
      else {
        const h = HOURS[ci++ % HOURS.length];
        inv = {};
        RES.forEach((r) => (inv[r] = Math.round(((s.occupied || 0) * cfg.rates[r] / 24) * h * MULT[r])));
      }
      batch.update(d.ref, { inventory: inv, inventoryUpdatedAt: FieldValue.serverTimestamp(), inventoryUpdatedByName: by });
    });
    await batch.commit();
    res.status(201).json({ updated: docs.length });
  } catch (err) {
    next(err);
  }
};

exports.clearDemo = async (req, res, next) => {
  try {
    const snap = await db.collection("shelters").where("demo", "==", true).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { inventory: FieldValue.delete(), inventoryUpdatedAt: FieldValue.delete(), inventoryUpdatedByName: FieldValue.delete() }));
    await batch.commit();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};