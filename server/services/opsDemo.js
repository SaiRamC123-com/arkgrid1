const { admin, db } = require("../config/firebaseAdmin");
const realtime = require("./realtime");
const { distanceM } = require("../utils/geo");

const { FieldValue } = require("firebase-admin/firestore");

/* ---------- Demo movers: only DEMO teams are ever simulated ---------- */
const movers = new Map(); // teamId -> { pos, target }
let timer = null;

async function tick() {
  if (!movers.size) { clearInterval(timer); timer = null; return; }
  const batch = db.batch();
  let arrived = false;

  for (const [id, m] of movers) {
    const ref = db.collection("teams").doc(id);
    const d = distanceM(m.pos, m.target);
    if (d < 40) {
      batch.update(ref, { status: "on_scene", location: { ...m.target, accuracy: 8 }, locationAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      movers.delete(id);
      arrived = true;
      continue;
    }
    const f = Math.min(1, Math.max(0.15, 150 / d));
    m.pos = { lat: m.pos.lat + (m.target.lat - m.pos.lat) * f, lng: m.pos.lng + (m.target.lng - m.pos.lng) * f };
    batch.update(ref, { location: { ...m.pos, accuracy: 8 }, locationAt: FieldValue.serverTimestamp() });
    realtime.emitOps("team:pos", { id, location: { ...m.pos, accuracy: 8 }, at: new Date().toISOString() });
  }

  try {
    await batch.commit();
  } catch (e) {
    console.warn("Demo simulation stopped:", e.message);
    movers.clear();
  }
  if (arrived) realtime.invalidate("teams");
  if (!movers.size && timer) { clearInterval(timer); timer = null; }
}

exports.addMover = (id, pos, target) => {
  movers.set(id, { pos: { ...pos }, target: { ...target } });
  if (!timer) timer = setInterval(() => tick().catch(() => {}), 5000);
};

exports.stopMover = (id) => {
  movers.delete(id);
  if (!movers.size && timer) { clearInterval(timer); timer = null; }
};

/* ---------- Demo data ---------- */
// [name, type, status, size, dxMeters, dyMeters]
const TEAMS = [
  ["Alpha Rescue", "rescue", "available", 6, -300, 200],
  ["Bravo Boat Unit", "boat", "available", 4, 500, -400],
  ["Charlie Medical", "medical", "available", 3, 150, 650],
  ["Delta Rescue", "rescue", "on_scene", 5, -700, -300],
  ["Echo Drone Scouts", "drone", "available", 2, 800, 500],
  ["Foxtrot Logistics", "logistics", "returning", 8, -500, 800],
];
// [name, kind, status, dx, dy, note]
const INFRA = [
  ["Central Substation", "power", "operational", 200, 300, ""],
  ["East Feeder Line", "power", "degraded", 1100, 250, "Intermittent supply reported"],
  ["Water Treatment Plant", "water", "operational", -900, 400, ""],
  ["North Pumping Station", "water", "down", 100, 1300, "Control room flooded"],
  ["Telecom Tower T-14", "telecom", "degraded", -1200, -500, "Running on battery backup"],
  ["Old River Bridge", "bridge", "down", 1500, -700, "Closed pending structural inspection"],
  ["District Hospital Backup Power", "hospital_power", "operational", 400, -200, "Generator at 72% fuel"],
  ["City Fuel Depot", "fuel", "operational", -600, -1100, ""],
];

exports.seed = async (lat, lng, by) => {
  if (!(await db.collection("teams").where("demo", "==", true).limit(1).get()).empty) {
    throw Object.assign(new Error("Demo ops data already loaded. Clear it first"), { status: 409 });
  }
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const at = (dx, dy) => ({ lat: +(lat + dy / 110540).toFixed(6), lng: +(lng + dx / kx).toFixed(6) });
  const batch = db.batch();

  TEAMS.forEach(([name, type, status, size, dx, dy]) => {
    batch.set(db.collection("teams").doc(), {
      name, type, status, size, memberUids: [], note: "", assignedIncidentId: null,
      location: { ...at(dx, dy), accuracy: 10 }, locationAt: Timestamp.now(),
      demo: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedByName: by,
    });
  });
  INFRA.forEach(([name, kind, status, dx, dy, note]) => {
    batch.set(db.collection("infra").doc(), {
      name, kind, status, note, ...at(dx, dy),
      history: [{ status, at: Timestamp.now(), by: "Demo" }],
      demo: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedByName: by,
    });
  });
  await batch.commit();
  return TEAMS.length + INFRA.length;
};

exports.clear = async () => {
  movers.clear();
  if (timer) { clearInterval(timer); timer = null; }
  const [t, i] = await Promise.all([
    db.collection("teams").where("demo", "==", true).get(),
    db.collection("infra").where("demo", "==", true).get(),
  ]);
  const batch = db.batch();
  [...t.docs, ...i.docs].forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return t.size + i.size;
};