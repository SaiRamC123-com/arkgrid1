const { admin, db, FieldValue, Timestamp } = require("../config/firebaseAdmin");

const ml = require("./mlClient");
const { distanceM, validCoords } = require("../utils/geo");
const PARAMS = {
  algorithm: process.env.CLUSTER_ALGORITHM === "hdbscan" ? "hdbscan" : "dbscan",
  eps_m: Number(process.env.CLUSTER_EPS_M) || 150,
  time_window_min: Number(process.env.CLUSTER_WINDOW_MIN) || 60,
  min_samples: 2,
};
const SEV = { low: 1, medium: 2, high: 3, critical: 4 };
const REPORT_WINDOW_MS = 72 * 3600 * 1000;
const key = (kind, id) => `${kind}:${id}`;

/* ---------- 1) Gather live signals ---------- */
async function gather() {
  const now = Date.now();
  const [sosSnap, repSnap] = await Promise.all([
    db.collection("sos").where("status", "==", "active").limit(300).get(),
    db.collection("reports").orderBy("createdAt", "desc").limit(400).get(),
  ]);
  const events = [];

  sosSnap.forEach((d) => {
    const s = d.data();
    events.push({
      kind: "sos", id: d.id, key: key("sos", d.id),
      lat: s.location?.lat ?? null, lng: s.location?.lng ?? null,
      t: (s.triggeredAt?.toMillis?.() || now) / 1000,
      weight: 3, severity: "critical", status: "active", type: null,
      needs: s.needs || [], people: s.peopleCount || 1, incidentId: s.incidentId || null,
    });
  });

  repSnap.forEach((d) => {
    const r = d.data();
    const created = r.createdAt?.toMillis?.() || now;
    if (!["unverified", "verified"].includes(r.status) || now - created > REPORT_WINDOW_MS) return;
    events.push({
      kind: "report", id: d.id, key: key("report", d.id),
      lat: r.lat, lng: r.lng, t: created / 1000,
      weight: r.status === "verified" ? 1.5 : 1,
      severity: r.ai?.severity || (["stranded", "powerline"].includes(r.type) ? "high" : "medium"),
      status: r.status, type: r.type, needs: [], people: 0, incidentId: r.incidentId || null,
    });
  });
  return events;
}

/* ---------- 2) Cluster (ML service, with a safe fallback) ---------- */
function fallbackCluster(events, p) {
  const n = events.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const win = p.time_window_min * 60;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (Math.abs(events[i].t - events[j].t) <= win && distanceM(events[i], events[j]) <= p.eps_m)
        parent[find(i)] = find(j);

  const groups = new Map();
  events.forEach((e, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(e);
  });
  return [...groups.values()].map((g) => {
    const w = g.reduce((a, e) => a + e.weight, 0);
    const c = { lat: g.reduce((a, e) => a + e.lat * e.weight, 0) / w, lng: g.reduce((a, e) => a + e.lng * e.weight, 0) / w };
    return { members: g.map((e) => e.id), centroid: c, radius_m: g.length > 1 ? Math.max(...g.map((e) => distanceM(c, e))) : 0 };
  });
}

// Never trust the ML reply blindly: every signal must appear exactly once
function validClusters(clusters, payload) {
  if (!Array.isArray(clusters)) return false;
  const seen = new Set();
  for (const c of clusters) {
    if (!Array.isArray(c.members) || !c.centroid) return false;
    for (const id of c.members) {
      if (seen.has(id)) return false;
      seen.add(id);
    }
  }
  return seen.size === payload.length && payload.every((e) => seen.has(e.id));
}

async function clusterLocated(located) {
  if (!located.length) return { clusters: [], engine: "none" };
  const payload = located.map((e) => ({ id: e.key, kind: e.kind, lat: e.lat, lng: e.lng, t: e.t, weight: e.weight }));
  try {
    const r = await ml.cluster(payload, PARAMS);
    if (!validClusters(r.clusters, payload)) throw new Error("ML reply failed validation");
    return { clusters: r.clusters, engine: `ml-${r.meta?.algorithm || PARAMS.algorithm}` };
  } catch (err) {
    console.warn("ML service unavailable, using fallback clustering:", err.message);
    return { clusters: fallbackCluster(payload, PARAMS), engine: "fallback" };
  }
}

/* ---------- 3) Summaries ---------- */
function summarize(members, c) {
  const sos = members.filter((m) => m.kind === "sos");
  const reps = members.filter((m) => m.kind === "report");
  const severity = members.reduce((b, m) => (SEV[m.severity] > SEV[b] ? m.severity : b), "low");
  const parts = [];
  if (sos.length) parts.push(`${sos.length} SOS`);
  if (reps.length) parts.push(`${reps.length} report${reps.length > 1 ? "s" : ""}`);
  return {
    memberKeys: members.map((m) => m.key),
    centroid: c.centroid || null,
    radiusM: Math.round(c.radius_m || 0),
    counts: {
      sos: sos.length, reports: reps.length,
      unverified: reps.filter((r) => r.status === "unverified").length,
      verified: reps.filter((r) => r.status === "verified").length,
    },
    types: [...new Set(reps.map((r) => r.type))],
    needs: [...new Set(sos.flatMap((s) => s.needs))],
    people: sos.reduce((a, s) => a + s.people, 0),
    severity,
    unlocated: !c.centroid,
    firstAt: Timestamp.fromMillis(Math.round(Math.min(...members.map((m) => m.t)) * 1000)),
    lastAt: Timestamp.fromMillis(Math.round(Math.max(...members.map((m) => m.t)) * 1000)),
    title: parts.join(" + "),
  };
}

async function commit(writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const b = db.batch();
    writes.slice(i, i + 400).forEach((w) => (w.update ? b.update(w.ref, w.data) : b.set(w.ref, w.data, { merge: true })));
    await b.commit();
  }
}

/* ---------- 4) Reconcile with existing incidents (stable IDs) ---------- */
async function reconcile(clusters, byKey, engine) {
  const openSnap = await db.collection("incidents").where("status", "==", "open").limit(400).get();
  const existing = new Map();
  const keyOwner = new Map();
  openSnap.forEach((d) => {
    const data = d.data();
    const keys = new Set(data.memberKeys || []);
    existing.set(d.id, { ref: d.ref, data, keys });
    keys.forEach((k) => keyOwner.set(k, d.id));
  });

  const summaries = clusters.map((c) => summarize(c.members.map((k) => byKey.get(k)), c));
  const clusterOfKey = new Map();
  summaries.forEach((s, i) => s.memberKeys.forEach((k) => clusterOfKey.set(k, i)));

  // Biggest clusters claim first; each existing incident can be claimed once
  const order = summaries.map((_, i) => i).sort((a, b) => summaries[b].memberKeys.length - summaries[a].memberKeys.length);
  const claimed = new Set();
  const assigned = new Array(summaries.length).fill(null);
  for (const i of order) {
    const votes = new Map();
    summaries[i].memberKeys.forEach((k) => {
      const id = keyOwner.get(k);
      if (id && !claimed.has(id)) votes.set(id, (votes.get(id) || 0) + 1);
    });
    const best = [...votes.entries()].sort(
      (a, b) =>
        b[1] - a[1] ||
        (existing.get(a[0]).data.createdAt?.toMillis?.() || 0) - (existing.get(b[0]).data.createdAt?.toMillis?.() || 0)
    )[0];
    if (best) {
      claimed.add(best[0]);
      assigned[i] = best[0];
    }
  }

  const writes = [];
  const memberWrites = [];
  summaries.forEach((s, i) => {
    const prev = assigned[i] ? existing.get(assigned[i]) : null;
    const ref = prev ? prev.ref : db.collection("incidents").doc();
    const base = { ...s, status: "open", engine, code: ref.id.slice(0, 5).toUpperCase(), updatedAt: FieldValue.serverTimestamp() };

    let data;
    if (!prev) {
      data = { ...base, ops: "new", note: "", hasNewActivity: false, createdAt: FieldValue.serverTimestamp() };
    } else {
      data = base; // ops, note and createdAt are never touched here
      const grew = s.memberKeys.some((k) => !prev.keys.has(k));
      const escalated = SEV[s.severity] > SEV[prev.data.severity || "low"];
      if (prev.data.ops !== "new" && (grew || escalated)) data.hasNewActivity = true;
    }
    writes.push({ ref, data });

    s.memberKeys.forEach((k) => {
      const ev = byKey.get(k);
      if (ev.incidentId !== ref.id) {
        memberWrites.push({ ref: db.collection(ev.kind === "sos" ? "sos" : "reports").doc(ev.id), data: { incidentId: ref.id }, update: true });
      }
    });
  });

  // Existing incidents nobody claimed: merged into another one, or fully resolved
  for (const [id, e] of existing) {
    if (claimed.has(id)) continue;
    const tally = new Map();
    e.keys.forEach((k) => {
      const ci = clusterOfKey.get(k);
      if (ci !== undefined && assigned[ci]) tally.set(assigned[ci], (tally.get(assigned[ci]) || 0) + 1);
    });
    const target = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    writes.push({
      ref: e.ref,
      data: target
        ? { status: "merged", mergedInto: target, updatedAt: FieldValue.serverTimestamp() }
        : { status: "closed", closeReason: "all signals resolved", closedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
    });
  }

  await commit(writes);
  try {
    await commit(memberWrites);
  } catch (e) {
    console.warn("Member link update skipped (will self-heal next run):", e.message);
  }
  return summaries.length;
}

/* ---------- Runner ---------- */
let running = false;
let again = false;
let timer = null;

async function runCluster() {
  if (running) {
    again = true;
    return null;
  }
  running = true;
  const t0 = Date.now();
  try {
    const events = await gather();
    const located = events.filter((e) => e.lat != null && validCoords(e.lat, e.lng));
    const unlocated = events.filter((e) => !located.includes(e));
    const byKey = new Map(events.map((e) => [e.key, e]));

    const { clusters, engine } = await clusterLocated(located);
    // An SOS without any location is still an incident, never dropped
    unlocated.forEach((e) => clusters.push({ members: [e.key], centroid: null, radius_m: 0 }));

    const incidents = await reconcile(clusters, byKey, engine);
    require("./realtime").invalidate("incidents");
    const result = { signals: events.length, incidents, engine, durationMs: Date.now() - t0 };
    await db.collection("meta").doc("clustering").set({ ...result, params: PARAMS, ok: true, lastRunAt: FieldValue.serverTimestamp() });
    return result;
  } catch (err) {
    console.error("Clustering run failed:", err);
    await db.collection("meta").doc("clustering").set({ ok: false, error: String(err.message).slice(0, 200), lastRunAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    return { error: err.message };
  } finally {
    running = false;
    if (again) {
      again = false;
      setTimeout(() => runCluster().catch(() => {}), 500);
    }
  }
}

exports.runCluster = runCluster;

// Debounced trigger: bursts of new signals cause a single run
exports.scheduleCluster = (ms = 4000) => {
  clearTimeout(timer);
  timer = setTimeout(() => runCluster().catch((e) => console.error(e)), ms);
};

exports.startClusterJob = () => {
  const every = (Number(process.env.CLUSTER_INTERVAL_SEC) || 45) * 1000;
  setTimeout(() => runCluster().catch(() => {}), 3000);
  setInterval(() => runCluster().catch(() => {}), every);
};