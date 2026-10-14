const crypto = require("crypto");
const { db } = require("../config/firebaseAdmin");
const { validCoords } = require("../utils/geo");
const ml = require("../services/mlClient");
const mlError = require("../utils/mlError");

const httpError = (status, message) => Object.assign(new Error(message), { status });
const num = (v, d) => (v === undefined || v === null || v === "" ? d : Number(v));
const given = (v) => v !== undefined && v !== null && v !== "";
const range = (v, lo, hi, msg) => { if (!(v >= lo && v <= hi)) throw httpError(400, msg); return v; };

const cache = new Map(); // simId -> { at, result }
exports.getCached = (id) => {
  const h = cache.get(id);
  return h && Date.now() - h.at < 3600e3 ? h.result : null;
};

async function exposure(r) {
  const b = r.bounds;
  const n = r.grid;
  const surge = r.mode === "surge";
  const cellAt = (lat, lng) => {
    const i = Math.floor((lat - b.south) / r.cell.dLat);
    const j = Math.floor((lng - b.west) / r.cell.dLng);
    return i < 0 || j < 0 || i >= n || j >= n ? null : r.cells[i * n + j];
  };
  const hit = (c) => (!c ? null : surge ? (c.t != null ? { tMin: c.t, depth: c.d } : null) : c.hi != null ? { tMin: c.hi * 60, depth: null } : null);

  const [sh, inf, sos, rd, tm] = await Promise.all([
    db.collection("shelters").limit(500).get(),
    db.collection("infra").limit(200).get(),
    db.collection("sos").where("status", "==", "active").limit(200).get(),
    db.collection("roads").limit(300).get(),
    db.collection("teams").limit(100).get(),
  ]);
  const top = (a) => a.sort((x, y) => x.tMin - y.tMin).slice(0, 60);

  const facilities = top(sh.docs.map((d) => {
    const s = d.data(); const h = hit(cellAt(s.lat, s.lng));
    return h && { id: d.id, name: s.name, type: s.type, occupied: s.occupied || 0, capacity: s.capacity || 0, ...h };
  }).filter(Boolean));
  const infra = top(inf.docs.map((d) => {
    const s = d.data(); const h = hit(cellAt(s.lat, s.lng));
    return h && { id: d.id, name: s.name, kind: s.kind, status: s.status, ...h };
  }).filter(Boolean));
  const sosList = top(sos.docs.map((d) => {
    const s = d.data(); const h = s.location && hit(cellAt(s.location.lat, s.location.lng));
    return h && { id: d.id, name: s.name, people: s.peopleCount || 1, ...h };
  }).filter(Boolean));
  const roads = top(rd.docs.map((d) => {
    const s = d.data();
    const hs = (s.coords || []).map((p) => hit(cellAt(p.lat, p.lng))).filter(Boolean);
    return hs.length && { id: d.id, name: s.name, status: s.status, tMin: Math.min(...hs.map((x) => x.tMin)), depth: null };
  }).filter(Boolean));
  const teams = top(tm.docs.map((d) => {
    const s = d.data(); const h = s.location && hit(cellAt(s.location.lat, s.location.lng));
    return h && { id: d.id, name: s.name, ...h };
  }).filter(Boolean));

  const all = [...facilities, ...infra, ...sosList, ...roads, ...teams];
  return {
    facilities, infra, sos: sosList, roads, teams,
    totals: {
      facilities: facilities.length, infra: infra.length, sos: sosList.length, roads: roads.length, teams: teams.length,
      people: facilities.reduce((a, f) => a + f.occupied, 0) + sosList.reduce((a, s) => a + s.people, 0),
      earliestMin: all.length ? Math.min(...all.map((x) => x.tMin)) : null,
    },
    definition: surge ? "Exposed = the cell floods in the scenario" : "Exposed = the cell reaches the High susceptibility tier",
  };
}

exports.run = async (req, res, next) => {
  try {
    const b = req.body || {};
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!validCoords(lat, lng)) throw httpError(400, "A valid location is required");
    const radiusM = Math.round(num(b.radiusM, 3000));
    const grid = Math.round(num(b.grid, 14));
    range(radiusM, 500, 8000, "Radius must be between 0.5 and 8 km");
    range(grid, 8, 20, "Detail must be between 8 and 20");
    if ((2 * radiusM) / grid < 90) throw httpError(400, "Too detailed for a 90 m terrain model. Increase the radius or lower the detail");
    if (!["rain", "surge"].includes(b.mode)) throw httpError(400, "Choose a rain or surge scenario");

    const payload = { lat, lng, radius_m: radiusM, grid, mode: b.mode, soil_perm: range(num(b.soil, 0.5), 0, 1, "Soil must be 0-1") };
    if (b.mode === "rain") {
      const r = b.rain || {};
      payload.rain = {
        intensity_mm_h: range(Number(r.intensity), 1, 150, "Rain intensity must be 1-150 mm/h"),
        hours: Math.round(range(num(r.hours, 6), 1, 12, "Duration must be 1-12 h")),
        antecedent_mm: range(num(r.antecedent, 0), 0, 300, "Earlier rain must be 0-300 mm"),
      };
    } else {
      const s = b.surge || {};
      payload.surge = {
        height_m: range(Number(s.height), 0.1, 5, "Surge height must be 0.1-5 m"),
        rise_m_per_h: range(num(s.rise, 0.5), 0.05, 3, "Rise rate must be 0.05-3 m/h"),
        walk_ms: range(num(s.walk, 0.8), 0.2, 2, "Walking speed must be 0.2-2 m/s"),
      };
      if (given(s.sourceLat) && given(s.sourceLng)) {
        if (!validCoords(Number(s.sourceLat), Number(s.sourceLng))) throw httpError(400, "Invalid water source location");
        payload.surge.source_lat = Number(s.sourceLat);
        payload.surge.source_lng = Number(s.sourceLng);
      }
    }

    const result = await ml.simulate(payload);
    const simId = crypto.randomUUID();
    cache.set(simId, { at: Date.now(), result });
    if (cache.size > 20) cache.delete(cache.keys().next().value);
    res.json({ simId, ...result, exposure: await exposure(result) });
  } catch (err) {
    next(mlError(err, "simulation"));
  }
};