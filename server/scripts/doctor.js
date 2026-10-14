const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const axios = require("axios");

const out = [];
const add = (level, msg, hint) => out.push({ level, msg, hint });
const ok = (m) => add("ok", m);
const warn = (m, h) => add("warn", m, h);
const bad = (m, h) => add("bad", m, h);
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timed out")), ms));

(async () => {
  const major = Number(process.versions.node.split(".")[0]);
  major >= 18 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node}`, "Use Node 18 or newer");

  const need = {
    CLIENT_URL: "e.g. http://localhost:5173",
    RESPONDER_CODE: "invite code for responder sign-up",
    COMMANDER_CODE: "invite code for commander sign-up",
    ML_SERVICE_URL: "e.g. http://localhost:8000",
    ML_API_KEY: "must match ml-service/.env",
  };
  Object.entries(need).forEach(([k, h]) => (process.env[k] ? ok(`${k} is set`) : bad(`${k} is missing`, h)));
  process.env.GROQ_API_KEY ? ok("GROQ_API_KEY is set") : warn("GROQ_API_KEY is missing", "ArkBot and AI report classification will be disabled");
  process.env.FIREBASE_STORAGE_BUCKET ? ok("FIREBASE_STORAGE_BUCKET is set") : warn("FIREBASE_STORAGE_BUCKET is missing", "Report photos will be skipped");

  const keyPath = path.join(__dirname, "../config/serviceAccountKey.json");
  const hasEnvKey = Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  );
  if (!fs.existsSync(keyPath) && !hasEnvKey) {
    bad("Firebase credentials missing", "Provide config/serviceAccountKey.json or set FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_BASE64 in env");
  } else {
    try {
      const { db } = require("../config/firebaseAdmin");
      await Promise.race([db.collection("meta").limit(1).get(), timeout(10000)]);
      ok("Firestore is reachable");
      if (process.env.FIREBASE_STORAGE_BUCKET) {
        const [exists] = await Promise.race([require("../config/storage")().exists(), timeout(10000)]);
        exists ? ok("Storage bucket exists") : warn("Storage bucket not found", "Check FIREBASE_STORAGE_BUCKET (and that Storage is enabled for your plan)");
      }
    } catch (e) {
      bad(`Firebase: ${e.message}`, "Check the service account key and that Firestore is created");
    }
  }

  const ml = process.env.ML_SERVICE_URL;
  if (ml) {
    try {
      const r = await axios.get(`${ml}/health`, { timeout: 4000 });
      ok(`ML service is up (flood model: ${r.data.flood_model?.kind || "unknown"})`);
      try {
        await axios.post(`${ml}/cluster`, { events: [] }, { headers: { "X-Internal-Key": process.env.ML_API_KEY || "" }, timeout: 4000 });
        ok("ML_API_KEY is accepted by the ML service");
      } catch (e) {
        if (e.response?.status === 401) bad("ML service rejected ML_API_KEY", "Make server/.env and ml-service/.env use the same key");
      }
    } catch {
      warn("ML service is not reachable", "Start it: cd ml-service && uvicorn main:app --port 8000. Clustering falls back to simple grouping, but flood risk, the simulator and search zones need it");
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      await Promise.race([require("../config/groq").models.list(), timeout(10000)]);
      ok("Groq key works");
    } catch (e) {
      bad(`Groq: ${e.message}`, "Check the key at console.groq.com");
    }
  }

  const icon = { ok: "✓", warn: "!", bad: "✗" };
  console.log("\nArkGrid doctor\n");
  out.forEach((r) => console.log(` ${icon[r.level]} ${r.msg}${r.hint && r.level !== "ok" ? `\n     → ${r.hint}` : ""}`));
  const fails = out.filter((r) => r.level === "bad").length;
  const warns = out.filter((r) => r.level === "warn").length;
  console.log(`\n${fails ? `${fails} problem(s) to fix.` : "No blocking problems."}${warns ? ` ${warns} warning(s).` : ""}\n`);
  process.exitCode = fails ? 1 : 0;
})();