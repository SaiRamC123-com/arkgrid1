const { db } = require("../config/firebaseAdmin");
const { distanceM } = require("./geo");

const RES = ["water", "rations", "medical"];
const UNIT = { water: "L", rations: "meals", medical: "kits" };
// Planning assumptions per person per day. Water and food follow commonly used humanitarian minimums;
// the medical rate is a placeholder. Confirm all of them with your agency before real use.
const DEFAULT_RATES = { water: 15, rations: 3, medical: 0.05 };
const DEFAULT_TH = { warnH: 24, critH: 8, targetH: 48, maxKm: 40 };

const fmtH = (h) => (h < 1 ? "<1 h" : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} d`);

async function loadConfig() {
  const snap = await db.collection("meta").doc("logisticsConfig").get();
  const d = snap.exists ? snap.data() : {};
  return {
    rates: { ...DEFAULT_RATES, ...(d.rates || {}) },
    thresholds: { ...DEFAULT_TH, ...(d.thresholds || {}) },
    custom: snap.exists,
    by: d.updatedByName || null,
  };
}

// facs: [{id,name,type,lat,lng,occupied,capacity,inventory:{water,rations,medical}|null,...}]
function analyze(facs, rates, th, surgePct = 0) {
  const rows = [];
  const untracked = [];
  facs.forEach((f) => {
    if (!f.inventory) return untracked.push({ id: f.id, name: f.name, type: f.type });
    let persons = f.type === "relief" ? 0 : Math.ceil((f.occupied || 0) * (1 + surgePct / 100));
    if (f.capacity > 0) persons = Math.min(persons, f.capacity);
    const res = {};
    RES.forEach((r) => {
      const stock = Math.max(0, Number(f.inventory[r]) || 0);
      const burnH = (persons * rates[r]) / 24;
      res[r] = { stock, burnH, runwayH: burnH > 0 ? stock / burnH : null };
    });
    const runs = RES.map((r) => res[r].runwayH).filter((v) => v !== null);
    rows.push({ ...f, persons, res, minRunwayH: runs.length ? Math.min(...runs) : null });
  });

  const alerts = [];
  rows.filter((x) => x.persons > 0).forEach((x) => {
    const bad = RES.filter((r) => x.res[r].runwayH !== null && x.res[r].runwayH < th.warnH);
    if (!bad.length) return;
    const crit = bad.some((r) => x.res[r].stock <= 0 || x.res[r].runwayH < th.critH);
    alerts.push({
      facilityId: x.id, name: x.name, lat: x.lat, lng: x.lng, level: crit ? "critical" : "warning",
      message: `${x.name}: ${bad.map((r) => (x.res[r].stock <= 0 ? `${r} OUT` : `${r} ~${fmtH(x.res[r].runwayH)}`)).join(", ")} left (${x.persons} people)`,
    });
  });

  const transfers = [];
  const shortfall = [];
  RES.forEach((r) => {
    const donors = rows
      .map((x) => ({ x, surplus: x.type === "relief" ? x.res[r].stock : Math.max(0, x.res[r].stock - x.res[r].burnH * th.targetH) }))
      .filter((d) => d.surplus >= 1);
    rows
      .filter((x) => x.persons > 0 && x.res[r].runwayH !== null && x.res[r].runwayH < th.warnH)
      .sort((a, b) => a.res[r].runwayH - b.res[r].runwayH)
      .forEach((x) => {
        let need = Math.ceil(x.res[r].burnH * th.targetH - x.res[r].stock);
        if (need < 1) return;
        donors
          .filter((d) => d.surplus >= 1 && d.x.id !== x.id)
          .map((d) => ({ d, km: distanceM(d.x, x) / 1000 }))
          .filter((c) => c.km <= th.maxKm)
          .sort((a, b) => a.km - b.km)
          .forEach(({ d, km }) => {
            const q = Math.floor(Math.min(need, d.surplus));
            if (q < 1) return;
            d.surplus -= q;
            need -= q;
            transfers.push({ resource: r, from: d.x, to: x, qty: q, km });
          });
        if (need >= 1) shortfall.push({ facilityId: x.id, name: x.name, resource: r, qty: Math.ceil(need), runwayH: x.res[r].runwayH });
      });
  });

  const trips = new Map();
  transfers.forEach((t) => {
    const key = `${t.from.id}>${t.to.id}`;
    if (!trips.has(key)) {
      trips.set(key, {
        id: key, km: Number(t.km.toFixed(1)), items: [], urgencyH: Infinity,
        from: { id: t.from.id, name: t.from.name, lat: t.from.lat, lng: t.from.lng },
        to: { id: t.to.id, name: t.to.name, lat: t.to.lat, lng: t.to.lng },
      });
    }
    const trip = trips.get(key);
    trip.items.push({ resource: t.resource, qty: t.qty, unit: UNIT[t.resource] });
    trip.urgencyH = Math.min(trip.urgencyH, t.to.res[t.resource].runwayH);
  });

  const system = {};
  RES.forEach((r) => {
    const stock = rows.reduce((a, x) => a + x.res[r].stock, 0);
    const burnH = rows.reduce((a, x) => a + x.res[r].burnH, 0);
    system[r] = { stock, burnH, runwayH: burnH > 0 ? stock / burnH : null, unit: UNIT[r] };
  });

  return {
    rows, untracked, alerts, system,
    plan: { trips: [...trips.values()].sort((a, b) => a.urgencyH - b.urgencyH), shortfall },
  };
}

module.exports = { RES, UNIT, DEFAULT_RATES, DEFAULT_TH, loadConfig, analyze };