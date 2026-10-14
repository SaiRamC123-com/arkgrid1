const normalizeOrigin = (url) => (url ? url.trim().replace(/\/+$/, "") : "");

const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const defaultOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
  "http://localhost:5000",
  ...configuredOrigins,
];

function isOriginAllowed(origin) {
  if (!origin) return true; // non-browser requests or same-origin
  const normalized = normalizeOrigin(origin);
  if (defaultOrigins.includes(normalized)) return true;

  try {
    const parsed = new URL(origin);
    // Allow Vercel deployments (production or preview branches)
    if (parsed.hostname.endsWith(".vercel.app")) return true;
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return true;
  } catch {
    return false;
  }
  return false;
}

const corsMiddlewareOptions = {
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) return cb(null, true);
    cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
};

module.exports = {
  isOriginAllowed,
  corsMiddlewareOptions,
};
