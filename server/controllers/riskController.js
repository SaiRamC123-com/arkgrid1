const { db } = require("../config/firebaseAdmin");
const { validCoords } = require("../utils/geo");
const { getRisk } = require("../services/riskService");
const ml = require("../services/mlClient");

const STALE_MS = 12 * 3600 * 1000;
const httpError = (status, message) => Object.assign(new Error(message), { status });
const num = (v, d) => (v === undefined || v === null || v === "" ? d : Number(v));
const given = (v) => v !== undefined && v !== null && v !== "";

// On-the-ground reports inside the analysed area, to sanity-check the model
async function observed(b) {
  const inBox = (la, ln) => la >= b.south && la <= b.north && ln >= b.west && ln <= b.east;
  const now = Date.now();
  const [rd, rp] = await Promise.all([
    db.collection("roads").limit(300).get(),
    db.collection("reports").orderBy("createdAt", "desc").limit(200).get(),
  ]);
  let roads = 0;
  let reports = 0;
  rd.forEach((d) => {
    const r = d.data();
    if (r.verified && r.status !== "passable" && now - (r.updatedAt?.toMillis?.() || 0) < STALE_MS && r.coords?.some((p) => inBox(p.lat, p.lng))) roads++;
  });
  rp.forEach((d) => {
    const r = d.data();
    if (r.status === "verified" && r.type === "submerged_road" && now - (r.createdAt?.toMillis?.() || 0) < 48 * 3600e3 && inBox(r.lat, r.lng)) reports++;
  });
  return { roads, reports };
}

exports.assess = async (req, res, next) => {
  try {
    const b = req.body || {};
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!validCoords(lat, lng)) throw httpError(400, "A valid location is required");

    const radiusM = Math.round(num(b.radiusM, 3000));
    const grid = Math.round(num(b.grid, 14));
    if (!(radiusM >= 500 && radiusM <= 8000)) throw httpError(400, "Radius must be between 0.5 and 8 km");
    if (!(grid >= 8 && grid <= 20)) throw httpError(400, "Detail must be between 8 and 20");
    if ((2 * radiusM) / grid < 90) throw httpError(400, "Too detailed for a 90 m terrain model. Increase the radius or lower the detail");

    const staff = req.user.role !== "citizen";
    let rain = null;
    let soil = 0.5;
    if (given(b.rain24) || given(b.soil)) {
      if (!staff) throw httpError(403, "Only responders and commanders can run scenarios");
    }
    if (given(b.rain24)) {
      const h24 = Number(b.rain24);
      const h1 = given(b.rain1) ? Number(b.rain1) : Math.min(80, h24 * 0.25);
      if (!(h24 >= 0 && h24 <= 600) || !(h1 >= 0 && h1 <= 150)) throw httpError(400, "Rainfall values are out of range");
      rain = { h24: Math.round(h24), h1: Math.round(Math.min(h1, h24)) };
    }
    if (given(b.soil)) {
      soil = Number(b.soil);
      if (!(soil >= 0 && soil <= 1)) throw httpError(400, "Soil permeability must be between 0 and 1");
    }

    const data = await getRisk({ lat, lng, radiusM, grid, rain, soil });
    res.json({ ...data, observed: await observed(data.bounds) });
  } catch (err) {
    if (err.isAxiosError) {
      if (!err.response) return next(httpError(503, "The flood-risk model service is offline. Start the ML service and try again."));
      if (err.response.status === 401) return next(httpError(502, "The ML service rejected the server key. Check ML_API_KEY."));
      const d = err.response.data?.detail;
      return next(httpError(502, typeof d === "string" ? d : "The flood-risk model could not run. Try again."));
    }
    next(err);
  }
};

exports.model = async (req, res, next) => {
  try {
    res.json(await ml.modelCard());
  } catch (err) {
    next(httpError(503, "The flood-risk model service is offline."));
  }
};