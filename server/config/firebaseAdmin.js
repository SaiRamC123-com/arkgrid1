const admin = require("firebase-admin");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const fs = require("fs");
const path = require("path");

function loadServiceAccount() {
  // Option 1: Base64-encoded JSON env var (FIREBASE_SERVICE_ACCOUNT_BASE64)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
      return JSON.parse(json);
    } catch (e) {
      throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64: ${e.message}`);
    }
  }

  // Option 2: Raw JSON string or base64 in FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_JSON
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawKey) {
    const trimmed = rawKey.trim();
    try {
      if (trimmed.startsWith("{")) {
        return JSON.parse(trimmed);
      }
      const decoded = Buffer.from(trimmed, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch (e) {
      throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT JSON: ${e.message}`);
    }
  }

  // Option 3: Local file (serviceAccountKey.json)
  const localKeyPath = path.join(__dirname, "serviceAccountKey.json");
  if (fs.existsSync(localKeyPath)) {
    return require(localKeyPath);
  }

  throw new Error(
    "Firebase credentials not found. On Render, set the FIREBASE_SERVICE_ACCOUNT environment variable with your Firebase service account JSON (or base64-encoded in FIREBASE_SERVICE_ACCOUNT_BASE64). For local development, place serviceAccountKey.json in server/config/."
  );
}

if (!getApps().length) {
  initializeApp({ credential: cert(loadServiceAccount()) });
}

module.exports = {
  admin,
  db: getFirestore(),
  auth: getAuth(),
  FieldValue,
  Timestamp,
};