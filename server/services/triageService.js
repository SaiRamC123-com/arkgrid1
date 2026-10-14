const { db } = require("../config/firebaseAdmin");
const realtime = require("./realtime");
const { peekRiskAt } = require("./riskService");

// ---- Starting assumptions: agree on these with domain experts before real use ----
const DEFAULT_WEIGHTS = { severity: 0.25, headcount: 0.15, vulnerability: 0.25, time: 0.15, hazard: 0.2 };
const KEYS = Object.keys(DEFAULT_WEIGHTS);
const SEV = { low: 0.25, medium: 0.5, high: 0.75, critical: 1 };
const SEV_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
const FLOW = { still: 0.1, slow: 0.35, moderate: 0.65, fast: 1 };
const VULN_W = { child: 0.3, elderly: 0.3, pregnant: 0.35, disability: 0.3, chronic: 0.25 };
const MOB_W = { none: 0, limited: 0.2, wheelchair: 0.45, bedridden: 0.6 };
const NEED_W = { medical: 0.35, trapped: 0.35 };
const TIME_TAU_H = 4; // waiting-time urgency: 1 - exp(-hours / 4)

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const iso = (ts) => ts?.toDate?.().toISOString() || null;

const scoreWith = (c, w) => {
  const tot = KEYS.reduce((a, k) => a + w[k], 0) || 1;
  return (100 * KEYS.reduce((a, k) => a + w[k] * c[k], 0)) / tot;
};

function sosVulnerability(s) {
  const m = s.medical || {};
  return clamp01(
    (m.vulnerabilities || []).reduce((a, k) => a + (VULN_W[k] || 0), 0) +
      (MOB_W[m.mobility] || 0) +
      (s.needs || []).reduce((a, k) => a + (NEED_W[k] || 0), 0)
  );
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How fragile is each rank? Re-score 300 times with every weight jittered by -30%..+30%
function sensitivity(items, w) {
  if (items.length < 2) return items.forEach((i) => (i.rankRange = [1, 1]));
  const rnd = mulberry(items.length * 7919 + 17);
  const lo = items.map(() => Infinity);
  const hi = items.map(() => 0);
  for (let d = 0; d < 300; d++) {
    const ww = {};
    KEYS.forEach((k) => (ww[k] = w[k] * (0.7 + 0.6 * rnd())));
    const sc = items.map((i) => scoreWith(i.criteria, ww));
    items.map((_, idx) => idx).sort((a, b) => sc[b] - sc[a]).forEach((idx, r) => {
      lo[idx] = Math.min(lo[idx], r + 1);
      hi[idx] = Math.max(hi[idx], r + 1);
    });
  }
  items.forEach((it, i) => (it.rankRange = [lo[i], hi[i]]));
}

async function getWeights() {
  const snap = await db.collection("meta").doc("triageWeights").get();
  if (!snap.exists) return { weights: { ...DEFAULT_WEIGHTS }, custom: false, by: null, at: null };
  const d = snap.data();
  return { weights: { ...DEFAULT_WEIGHTS, ...d.weights }, custom: true, by: d.updatedByName || null, at: iso(d.updatedAt) };
}

async function build() {
  const now = Date.now();
  const [incSnap, teamSnap, wts] = await Promise.all([
    db.collection("incidents").where("status", "==", "open").limit(300).get(),
    db.collection("teams").limit(100).get(),
    getWeights(),
  ]);

  const refs = [];
  incSnap.docs.forEach((d) => (d.data().memberKeys || []).forEach((k) => k.startsWith("sos:") && refs.push(db.collection("sos").doc(k.slice(4)))));
  const sosById = new Map((refs.length ? await db.getAll(...refs) : []).filter((d) => d.exists).map((d) => [d.id, d.data()]));
  const teams = teamSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const items = incSnap.docs.map((d) => {
    const s = d.data();
    const sosList = (s.memberKeys || []).filter((k) => k.startsWith("sos:")).map((k) => sosById.get(k.slice(4))).filter(Boolean);
    const flags = [];
    const sources = {};

    const severity = SEV[s.severity] ?? 0.5;
    sources.severity = `incident severity: ${s.severity || "medium"}`;

    const people = sosList.reduce((a, x) => a + (x.peopleCount || 1), 0);
    const headcount = people ? clamp01(Math.log1p(people) / Math.log1p(20)) : 0;
    sources.headcount = people ? `${people} people across ${sosList.length} SOS` : "no SOS headcount";
    if (!people) flags.push("Headcount unknown");

    let vulnerability;
    if (sosList.length) {
      const vs = sosList.map(sosVulnerability);
      vulnerability = clamp01(0.7 * Math.max(...vs) + 0.3 * (vs.reduce((a, b) => a + b, 0) / vs.length));
      sources.vulnerability = "SOS medical profiles and stated needs";
      if (sosList.every((x) => !x.medical)) flags.push("No medical profiles on file");
    } else {
      vulnerability = (s.types || []).includes("stranded") ? 0.4 : 0.2;
      sources.vulnerability = "default, because there is no SOS";
      flags.push("Vulnerability assumed");
    }

    const firstMs = sosList.length ? Math.min(...sosList.map((x) => x.triggeredAt?.toMillis?.() || now)) : s.firstAt?.toMillis?.() || now;
    const hours = Math.max(0, (now - firstMs) / 3.6e6);
    const time = 1 - Math.exp(-hours / TIME_TAU_H);
    sources.time = `waiting ${hours.toFixed(1)} h since the first request`;

    let hazard;
    if (s.flow && FLOW[s.flow] !== undefined) {
      hazard = FLOW[s.flow];
      sources.hazard = `assessed water flow: ${s.flow}`;
    } else {
      const r = s.centroid ? peekRiskAt(s.centroid) : null;
      if (r) {
        hazard = r.tier / 3;
        sources.hazard = "flood-risk model tier (prototype, unvalidated)";
      } else {
        hazard = 0.3;
        sources.hazard = "default, not assessed";
        flags.push("Flood hazard not assessed");
      }
    }
    if (!(s.counts?.sos) && !(s.counts?.verified)) flags.push("Unverified reports only");

    const assignedTeams = teams
      .filter((t) => t.assignedIncidentId === d.id && ["dispatched", "en_route", "on_scene"].includes(t.status))
      .map((t) => ({ name: t.name, status: t.status }));

    return {
      id: d.id, code: s.code || d.id.slice(0, 5).toUpperCase(), title: s.title || "Incident", severity: s.severity || "medium",
      ops: s.ops || "new", signals: (s.memberKeys || []).length, centroid: s.centroid || null, unlocated: !!s.unlocated,
      people, hours: Number(hours.toFixed(1)), flow: s.flow || null, firstAt: iso(s.firstAt), lastAt: iso(s.lastAt),
      criteria: { severity, headcount, vulnerability, time, hazard }, sources, flags,
      teams: assignedTeams, assigned: assignedTeams.length > 0,
    };
  });

  items.forEach((i) => (i.score = Number(scoreWith(i.criteria, wts.weights).toFixed(1))));
  items.sort((a, b) =>
    b.score - a.score || SEV_RANK[b.severity] - SEV_RANK[a.severity] || (Date.parse(a.firstAt) || 0) - (Date.parse(b.firstAt) || 0)
  );
  items.forEach((i, idx) => (i.rank = idx + 1));
  sensitivity(items, wts.weights);

  return {
    ranking: items,
    weights: wts,
    defaults: { ...DEFAULT_WEIGHTS },
    stats: { open: items.length, unassigned: items.filter((i) => !i.assigned).length },
    generatedAt: new Date().toISOString(),
  };
}

let cache = { v: -1, at: 0, data: null };
let inflight = null;
exports.getRanking = async () => {
  const v = realtime.version();
  if (cache.data && cache.v === v && Date.now() - cache.at < 5000) return cache.data;
  if (inflight && inflight.v === v) return inflight.p;
  const p = build()
    .then((data) => ((cache = { v, at: Date.now(), data }), data))
    .finally(() => { if (inflight?.p === p) inflight = null; });
  inflight = { v, p };
  return p;
};

exports.KEYS = KEYS;
exports.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;