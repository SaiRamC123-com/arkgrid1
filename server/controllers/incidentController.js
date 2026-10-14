const { admin, db } = require("../config/firebaseAdmin");
const { validCoords } = require("../utils/geo");
const { runCluster, scheduleCluster } = require("../services/clusterService");

const { FieldValue } = require("firebase-admin/firestore");

const OPS = ["new", "acknowledged", "dispatched"];
const httpError = (status, message) => Object.assign(new Error(message), { status });
const iso = (ts) => ts?.toDate?.().toISOString() || null;

const shape = (d) => {
  const s = d.data();
  return {
    id: d.id,
    code: s.code || d.id.slice(0, 5).toUpperCase(),
    title: s.title || "Incident",
    status: s.status,
    ops: s.ops || "new",
    note: s.note || "",
    hasNewActivity: !!s.hasNewActivity,
    severity: s.severity || "medium",
    centroid: s.centroid || null,
    radiusM: s.radiusM || 0,
    counts: s.counts || {},
    types: s.types || [],
    needs: s.needs || [],
    people: s.people || 0,
    signals: (s.memberKeys || []).length,
    unlocated: !!s.unlocated,
    engine: s.engine || null,
    firstAt: iso(s.firstAt),
    lastAt: iso(s.lastAt),
    updatedAt: iso(s.updatedAt),
    opsBy: s.opsByName || null,
    opsAt: iso(s.opsAt),
  };
};

exports.list = async (req, res, next) => {
  try {
    const [snap, meta, demo] = await Promise.all([
      db.collection("incidents").where("status", "==", "open").limit(300).get(),
      db.collection("meta").doc("clustering").get(),
      db.collection("reports").where("demo", "==", true).limit(1).get(),
    ]);
    const incidents = snap.docs.map(shape);
    const signals = incidents.reduce((a, i) => a + i.signals, 0);
    const m = meta.exists ? meta.data() : null;
    res.json({
      incidents,
      stats: {
        signals,
        incidents: incidents.length,
        reductionPct: signals ? Math.round((1 - incidents.length / signals) * 100) : 0,
        engine: m?.engine || null,
        lastRunAt: iso(m?.lastRunAt),
        ok: m ? m.ok !== false : true,
        demoLoaded: !demo.empty,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.get = async (req, res, next) => {
  try {
    const snap = await db.collection("incidents").doc(req.params.id).get();
    if (!snap.exists) throw httpError(404, "Incident not found");
    const s = snap.data();

    const refs = (s.memberKeys || []).map((k) => {
      const i = k.indexOf(":");
      return db.collection(k.slice(0, i) === "sos" ? "sos" : "reports").doc(k.slice(i + 1));
    });
    const docs = refs.length ? await db.getAll(...refs) : [];
    const members = docs
      .filter((d) => d.exists)
      .map((d) => {
        const m = d.data();
        if (d.ref.parent.id === "sos") {
          return { kind: "sos", id: d.id, name: m.name, people: m.peopleCount || 1, needs: m.needs || [], message: m.message || "", at: iso(m.triggeredAt), demo: !!m.demo };
        }
        return {
          kind: "report", id: d.id, type: m.type, status: m.status, description: m.description || "",
          summary: m.ai?.summary || "", severity: m.ai?.severity || null, photoUrl: m.photoUrl || null,
          at: iso(m.createdAt), demo: !!m.demo,
        };
      })
      .sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json({ incident: shape(snap), members });
  } catch (err) {
    next(err);
  }
};

exports.setOps = async (req, res, next) => {
  try {
    const { ops, note } = req.body || {};
    if (ops === undefined && note === undefined) throw httpError(400, "Nothing to update");
    if (ops !== undefined && !OPS.includes(ops)) throw httpError(400, "Invalid state");

    const ref = db.collection("incidents").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().status !== "open") throw httpError(404, "Open incident not found");

    const user = (await db.collection("users").doc(req.user.uid).get()).data();
    const patch = {
      hasNewActivity: false,
      opsByName: user?.name || "Staff",
      opsAt: FieldValue.serverTimestamp(),
    };
    if (ops !== undefined) patch.ops = ops;
    if (note !== undefined) patch.note = String(note).trim().slice(0, 300);
    await ref.update(patch);
    res.json({ incident: shape(await ref.get()) });
  } catch (err) {
    next(err);
  }
};

exports.recluster = async (req, res, next) => {
  try {
    const r = await runCluster();
    res.json(r || { skipped: true });
  } catch (err) {
    next(err);
  }
};

/* ---------- Demo burst (commander): 17 signals that should become 5 incidents ---------- */

const HOT = [
  { c: [0, 0], items: [["report", "submerged_road", 3, "verified"], ["report", "submerged_road", 5, "unverified"], ["report", "stranded", 6, "unverified"], ["report", "structural", 8, "verified"], ["report", "other", 9, "unverified"], ["sos", null, 4], ["sos", null, 7]] },
  { c: [1100, 1330], items: [["report", "powerline", 2, "verified"], ["report", "powerline", 3, "unverified"], ["report", "other", 5, "unverified"], ["report", "submerged_road", 6, "unverified"]] },
  { c: [1530, -1105], items: [["report", "stranded", 4, "unverified"], ["report", "stranded", 6, "unverified"], ["report", "structural", 7, "unverified"], ["sos", null, 5]] },
];
const LONE = [{ dx: -2200, dy: -2200, type: "submerged_road", min: 12 }, { dx: -1650, dy: 2210, type: "other", min: 9 }];
const HIGH = ["stranded", "powerline"];

const SUMMARY = {
  submerged_road: "Road under water, vehicles unable to pass",
  stranded: "People reported stranded and waiting for help",
  structural: "Building damage reported after flooding",
  powerline: "Downed powerline near standing water",
  other: "Flood-related hazard reported",
};

exports.seedDemo = async (req, res, next) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!validCoords(lat, lng)) throw httpError(400, "Valid lat and lng are required");
    if (!(await db.collection("reports").where("demo", "==", true).limit(1).get()).empty) {
      throw httpError(409, "Demo data already loaded. Clear it first");
    }

    const kx = 111320 * Math.cos((lat * Math.PI) / 180);
    const at = (dx, dy) => ({ lat: +(lat + dy / 110540).toFixed(6), lng: +(lng + dx / kx).toFixed(6) });
    const ago = (min) => Timestamp.fromMillis(Date.now() - min * 60000);

    const batch = db.batch();
    let n = 0;
    let sosN = 0;

    const addReport = (pos, type, min, status) => {
      batch.set(db.collection("reports").doc(), {
        uid: "demo", authorName: "Demo citizen", type, description: `Demo: ${SUMMARY[type]}`,
        ...pos, photoUrl: null, status,
        verifiedByRole: status === "verified" ? "commander" : null, confirmedBy: [],
        aiStatus: "done",
        ai: { type, severity: HIGH.includes(type) ? "high" : "medium", summary: SUMMARY[type], photoMatches: null, source: "demo" },
        demo: true, createdAt: ago(min), updatedAt: ago(min),
      });
      n++;
    };
    const addSOS = (pos, min) => {
      sosN++;
      batch.set(db.collection("sos").doc(`demo_sos_${sosN}`), {
        uid: `demo-${sosN}`, name: `Demo Citizen ${sosN}`, phone: "", status: "active", clientId: "demo",
        location: { ...pos, accuracy: 10 }, locationAt: ago(min),
        needs: sosN === 1 ? ["trapped", "water"] : ["medical"], peopleCount: sosN + 1, message: "Demo SOS",
        medical: null, delayedSec: 0, pingCount: 0, triggeredAt: ago(min), receivedAt: ago(min), demo: true,
      });
      n++;
    };

    HOT.forEach(({ c, items }) =>
      items.forEach(([kind, type, min, status], i) => {
        const ang = i * 2.4;
        const r = 15 + (i % 3) * 10; // all within ~35 m of the hotspot center
        const pos = at(c[0] + r * Math.cos(ang), c[1] + r * Math.sin(ang));
        kind === "sos" ? addSOS(pos, min) : addReport(pos, type, min, status);
      })
    );
    LONE.forEach(({ dx, dy, type, min }) => addReport(at(dx, dy), type, min, "unverified"));

    await batch.commit();
    scheduleCluster(500);
    res.status(201).json({ created: n });
  } catch (err) {
    next(err);
  }
};

async function deleteDemo(col) {
  const snap = await db.collection(col).where("demo", "==", true).limit(400).get();
  if (snap.empty) return 0;
  const b = db.batch();
  snap.docs.forEach((d) => b.delete(d.ref));
  await b.commit();
  return snap.size + (snap.size === 400 ? await deleteDemo(col) : 0);
}

exports.clearDemo = async (req, res, next) => {
  try {
    const removed = (await deleteDemo("reports")) + (await deleteDemo("sos"));
    scheduleCluster(500);
    res.json({ removed });
  } catch (err) {
    next(err);
  }
};