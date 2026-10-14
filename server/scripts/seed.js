const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { db } = require("../config/firebaseAdmin");
const { runCluster } = require("../services/clusterService");
const shelters = require("../controllers/shelterController");
const incidents = require("../controllers/incidentController");
const priority = require("../controllers/priorityController");
const ops = require("../controllers/opsController");
const logistics = require("../controllers/logisticsController");
const search = require("../controllers/searchController");

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const has = (n) => args.includes(`--${n}`);

// Drive the existing controllers with a fake request so seeding uses exactly the same code as the UI
const call = (fn, req) =>
  new Promise((resolve, reject) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(d) { resolve(d); } };
    fn(req, res, reject);
  });

const step = async (label, fn, req) => {
  try {
    const r = await call(fn, req);
    console.log(`  ✓ ${label}${r && typeof r === "object" ? `  ${JSON.stringify(r)}` : ""}`);
  } catch (e) {
    console.log(e.status === 409 ? `  • ${label}: already loaded` : `  ✗ ${label}: ${e.message}`);
  }
};

(async () => {
  const lat = Number(flag("lat"));
  const lng = Number(flag("lng"));
  if (!has("clear") && !(Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && flag("lat") && flag("lng"))) {
    console.log("Usage:\n  npm run seed -- --lat 12.9716 --lng 77.5946   (load demo data around a point)\n  npm run seed -- --clear                       (remove all demo data)");
    process.exit(1);
  }

  const snap = await db.collection("users").where("role", "==", "commander").limit(1).get();
  if (snap.empty) {
    console.error("No commander account found. Register one first (use your COMMANDER_CODE), then run this again.");
    process.exit(1);
  }
  const user = { uid: snap.docs[0].id, role: "commander" };
  const req = (body = {}) => ({ user, body, query: {}, params: {} });

  if (has("clear")) {
    console.log("\nClearing demo data…");
    await step("Search cases", search.clearDemo, req());
    await step("Relief stock", logistics.clearDemo, req());
    await step("Triage inputs", priority.clearDemo, req());
    await step("Teams and infrastructure", ops.clearDemo, req());
    await step("Reports and SOS", incidents.clearDemo, req());
    await step("Facilities", shelters.clearDemo, req());
    const r = await runCluster();
    console.log(`  ✓ Incidents re-clustered${r?.incidents != null ? ` (${r.incidents} open)` : ""}`);
  } else {
    console.log(`\nSeeding demo data around ${lat}, ${lng}…`);
    await step("Shelters, hospitals and relief points", shelters.seedDemo, req({ lat, lng }));
    await step("Citizen reports and SOS burst", incidents.seedDemo, req({ lat, lng }));
    process.stdout.write("  … clustering signals\n");
    const r = await runCluster();
    console.log(r?.error ? `  ✗ Clustering: ${r.error}` : `  ✓ ${r?.signals ?? 0} signals → ${r?.incidents ?? 0} incidents (${r?.engine || "n/a"})`);
    await step("Triage inputs (medical profiles, water flow)", priority.seedDemo, req());
    await step("Teams and infrastructure", ops.seedDemo, req({ lat, lng }));
    await step("Relief stock", logistics.seedDemo, req());
    await step("Search cases", search.seedDemo, req({ lat, lng }));
  }
  console.log("\nDone. Reload the app.\n");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });