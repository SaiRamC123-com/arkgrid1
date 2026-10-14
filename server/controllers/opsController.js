const { db } = require("../config/firebaseAdmin");
const { validCoords } = require("../utils/geo");
const realtime = require("../services/realtime");
const demo = require("../services/opsDemo");

const iso = (ts) => ts?.toDate?.().toISOString() || null;
const ms = (ts) => ts?.toMillis?.() || 0;
const TELE_STALE_MS = 5 * 60 * 1000;
const ROAD_STALE_MS = 12 * 3600 * 1000;
const RES = ["water", "food", "medical", "power"];
const RANK = { critical: 0, warning: 1 };
const { analyze, loadConfig } = require("../utils/logistics");
const safety = require("../services/safetyService");

const availability = (s) =>
  s.status === "closed" ? "closed" : s.capacity > 0 ? (s.occupied >= s.capacity ? "full" : s.occupied / s.capacity >= 0.75 ? "limited" : "open") : "open";

async function build() {
  const now = Date.now();
  const [sosS, incS, teamS, infS, shS, rdS, rpS] = await Promise.all([
    db.collection("sos").where("status", "==", "active").limit(200).get(),
    db.collection("incidents").where("status", "==", "open").limit(300).get(),
    db.collection("teams").limit(100).get(),
    db.collection("infra").limit(200).get(),
    db.collection("shelters").limit(500).get(),
    db.collection("roads").limit(300).get(),
    db.collection("reports").orderBy("createdAt", "desc").limit(200).get(),
  ]);
  const [lgCfg, scSnap] = await Promise.all([loadConfig(), db.collection("meta").doc("safetyScenario").get()]);

  const incidents = incS.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id, code: s.code || d.id.slice(0, 5).toUpperCase(), title: s.title || "Incident", ops: s.ops || "new",
      severity: s.severity || "medium", hasNewActivity: !!s.hasNewActivity, centroid: s.centroid || null, radiusM: s.radiusM || 0,
      counts: s.counts || {}, types: s.types || [], people: s.people || 0, signals: (s.memberKeys || []).length,
      unlocated: !!s.unlocated, firstAt: iso(s.firstAt), lastAt: iso(s.lastAt),
    };
  });
  const incById = new Map(incidents.map((i) => [i.id, i]));

  const sos = sosS.docs
    .map((d) => {
      const s = d.data();
      return {
        id: d.id, name: s.name, phone: s.phone || "", location: s.location || null, needs: s.needs || [],
        peopleCount: s.peopleCount || 1, message: s.message || "", medical: s.medical || null,
        delayedSec: s.delayedSec || 0, demo: !!s.demo, triggeredAt: iso(s.triggeredAt), lastPingAt: iso(s.lastPingAt),
        incidentCode: s.incidentId ? incById.get(s.incidentId)?.code || null : null,
      };
    })
    .sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt));

  const teams = teamS.docs.map((d) => {
    const s = d.data();
    const at = ms(s.locationAt);
    const inc = s.assignedIncidentId ? incById.get(s.assignedIncidentId) : null;
    return {
      id: d.id, name: s.name, type: s.type, status: s.status, size: s.size || 1, memberCount: (s.memberUids || []).length,
      location: s.location || null, locationAt: iso(s.locationAt), stale: !!at && s.status !== "offline" && now - at > TELE_STALE_MS,
      assignedIncidentId: s.assignedIncidentId || null, assignedIncidentCode: inc?.code || null,
      assignmentClosed: !!s.assignedIncidentId && !inc, note: s.note || "", demo: !!s.demo, updatedAt: iso(s.updatedAt),
    };
  });

  const infra = infS.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id, name: s.name, kind: s.kind, status: s.status, lat: s.lat, lng: s.lng, note: s.note || "",
      demo: !!s.demo, updatedAt: iso(s.updatedAt), updatedByName: s.updatedByName || "",
      history: (s.history || []).slice(-5).map((h) => ({ status: h.status, at: iso(h.at), by: h.by })),
    };
  });

  const shelterItems = shS.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id, name: s.name, type: s.type, lat: s.lat, lng: s.lng, capacity: s.capacity || 0, occupied: s.occupied || 0,
      status: s.status || "open", availability: availability(s), resources: s.resources || {},inventory: s.inventory || null,updatedAt: iso(s.updatedAt),
    };
  });
  const short = Object.fromEntries(RES.map((r) => [r, {
    low: shelterItems.filter((s) => s.resources[r] === "low").length,
    out: shelterItems.filter((s) => s.resources[r] === "out").length,
  }]));

  const roads = rdS.docs
    .map((d) => {
      const s = d.data();
      return { id: d.id, name: s.name, status: s.status, coords: s.coords || [], verified: !!s.verified, stale: now - ms(s.updatedAt) > ROAD_STATUS_STALE(s) };
    })
    .filter((r) => r.status !== "passable" && !r.stale);

  const openReports = rpS.docs.map((d) => d.data()).filter((r) => ["unverified", "verified"].includes(r.status) && now - ms(r.createdAt) < 72 * 3600e3);
  const reports = {
    open: openReports.length,
    unverified: openReports.filter((r) => r.status === "unverified").length,
    verified: openReports.filter((r) => r.status === "verified").length,
    highSeverity: openReports.filter((r) => ["high", "critical"].includes(r.ai?.severity)).length,
  };

  /* ---- Alert feed ---- */
  const alerts = [];
  const mins = (t) => Math.max(1, Math.round((now - t) / 60000));
  incidents.forEach((i) => {
    const first = Date.parse(i.firstAt) || now;
    if (i.severity === "critical" && i.ops === "new" && now - first > 5 * 60000) {
      alerts.push({ id: `inc-${i.id}`, level: "critical", kind: "incident", message: `INC-${i.code} (critical) unacknowledged for ${mins(first)} min`, at: i.lastAt, focus: i.centroid });
    }
  });
  infra.forEach((x) => {
    if (x.status === "operational") return;
    alerts.push({
      id: `inf-${x.id}-${x.status}`, level: x.status === "down" ? "critical" : "warning", kind: "infra",
      message: `${x.name} is ${x.status === "down" ? "DOWN" : "degraded"}${x.note ? `: ${x.note}` : ""}`, at: x.updatedAt, focus: { lat: x.lat, lng: x.lng },
    });
  });
  shelterItems.forEach((s) => {
    const out = RES.filter((r) => s.resources[r] === "out");
    if (out.length) {
      alerts.push({
        id: `sh-${s.id}-out`, level: s.type === "hospital" && out.includes("medical") ? "critical" : "warning", kind: "logistics",
        message: `${s.name} is out of ${out.join(", ")}`, at: s.updatedAt, focus: { lat: s.lat, lng: s.lng },
      });
    } else if (s.availability === "full") {
      alerts.push({ id: `sh-${s.id}-full`, level: "warning", kind: "logistics", message: `${s.name} is full`, at: s.updatedAt, focus: { lat: s.lat, lng: s.lng } });
    }
  });
  teams.forEach((t) => {
    if (t.stale) alerts.push({ id: `tm-${t.id}-stale`, level: "warning", kind: "team", message: `${t.name} has not reported its position for ${mins(Date.parse(t.locationAt))} min`, at: t.locationAt, focus: t.location });
  });
  const lg = analyze(shelterItems, lgCfg.rates, lgCfg.thresholds, 0);
lg.alerts.forEach((a) => alerts.push({ id: `lg-${a.facilityId}`, level: a.level, kind: "logistics", message: a.message, at: null, focus: { lat: a.lat, lng: a.lng } }));

const powerlines = rpS.docs
  .filter((d) => { const r = d.data(); return r.type === "powerline" && ["unverified", "verified"].includes(r.status) && now - ms(r.createdAt) < 72 * 3600e3; })
  .map((d) => ({ id: d.id, lat: d.data().lat, lng: d.data().lng, status: d.data().status }));
const sc = scSnap.exists ? scSnap.data() : null;
alerts.push(...safety.alerts({
  teams, powerlines, roads,
  scenario: sc && sc.expiresAt?.toMillis?.() > now ? sc : null,
}));
  alerts.sort((a, b) => RANK[a.level] - RANK[b.level] || new Date(b.at || 0) - new Date(a.at || 0));

  return {
    sos, incidents, teams, infra, roads, reports, alerts: alerts.slice(0, 30),
    shelters: {
      items: shelterItems,
      summary: {
        total: shelterItems.length,
        open: shelterItems.filter((s) => ["open", "limited"].includes(s.availability)).length,
        full: shelterItems.filter((s) => s.availability === "full").length,
        closed: shelterItems.filter((s) => s.availability === "closed").length,
        short,
      },
    },
    flags: { demoLoaded: teams.some((t) => t.demo) || infra.some((x) => x.demo) },
  };
}
const ROAD_STATUS_STALE = () => ROAD_STALE_MS;

// Cached 3 s and shared by every connected dashboard; any write invalidates it
let cache = { v: -1, at: 0, data: null };
let inflight = null;
async function getBase() {
  const v = realtime.version();
  if (cache.data && cache.v === v && Date.now() - cache.at < 3000) return cache.data;
  if (inflight && inflight.v === v) return inflight.p;
  const p = build()
  
    .then((data) => { cache = { v, at: Date.now(), data }; return data; })
    .finally(() => { if (inflight?.p === p) inflight = null; });
  inflight = { v, p };
  return p;
  
}

exports.overview = async (req, res, next) => {
  try {
    const [base, me] = await Promise.all([getBase(), db.collection("users").doc(req.user.uid).get()]);
    res.json({ ...base, me: { teamId: me.exists ? me.data().teamId || null : null }, serverTime: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
};

exports.seedDemo = async (req, res, next) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!validCoords(lat, lng)) throw Object.assign(new Error("Valid lat and lng are required"), { status: 400 });
    const by = (await db.collection("users").doc(req.user.uid).get()).data()?.name || "Commander";
    const created = await demo.seed(lat, lng, by);
    realtime.invalidate("teams");
    res.status(201).json({ created });
  } catch (err) {
    next(err);
  }
};

exports.clearDemo = async (req, res, next) => {
  try {
    const removed = await demo.clear();
    realtime.invalidate("teams");
    res.json({ removed });
  } catch (err) {
    next(err);
  }
};