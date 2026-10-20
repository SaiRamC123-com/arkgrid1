const axios = require("axios");

const SOURCE = "USGS Earthquake Hazards Program - FDSN Event Web Service";
const FEED_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const CACHE_TTL_MS = Number(process.env.USGS_CACHE_TTL_MS) > 0
  ? Number(process.env.USGS_CACHE_TTL_MS)
  : 5 * 60 * 1000;
const MAX_STALE_MS = 60 * 60 * 1000;
const cache = new Map();
const ALLOWED_HOURS = new Set([24, 168, 720]);

function cacheKey(hours, minMagnitude) {
  return `${hours}:${minMagnitude}`;
}

function pruneCache(now) {
  for (const [key, entry] of cache) {
    if (now - entry.cachedAt > MAX_STALE_MS) cache.delete(key);
  }
  while (cache.size > 100) cache.delete(cache.keys().next().value);
}

function normalizeFeature(feature) {
  const [lng, lat, depthKm] = feature.geometry?.coordinates || [];
  const properties = feature.properties || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(properties.time)) return null;

  return {
    id: feature.id,
    magnitude: Number.isFinite(properties.mag) ? properties.mag : null,
    location: properties.place || "Location not reported",
    time: new Date(properties.time).toISOString(),
    updated: Number.isFinite(properties.updated) ? new Date(properties.updated).toISOString() : null,
    latitude: lat,
    longitude: lng,
    depthKm: Number.isFinite(depthKm) ? depthKm : null,
    url: properties.url || null,
    eventType: properties.type || "unknown",
    tsunami: properties.tsunami === 1,
    alert: properties.alert || null,
    status: properties.status || null,
  };
}

exports.listEarthquakes = async (req, res, next) => {
  const hours = Number(req.query.hours || 24);
  const minMagnitude = Number(req.query.minMagnitude ?? 2.5);
  if (!ALLOWED_HOURS.has(hours)) {
    return res.status(400).json({ message: "hours must be 24, 168, or 720" });
  }
  if (!Number.isFinite(minMagnitude) || minMagnitude < 0 || minMagnitude > 10) {
    return res.status(400).json({ message: "minMagnitude must be between 0 and 10" });
  }

  const key = cacheKey(hours, minMagnitude);
  const now = Date.now();
  const cached = cache.get(key);
  const forceRefresh = req.query.refresh === "1";
  if (!forceRefresh && cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return res.json({ ...cached.payload, stale: false });
  }

  try {
    const starttime = new Date(now - hours * 60 * 60 * 1000).toISOString();
    const response = await axios.get(FEED_URL, {
      timeout: 10000,
      params: {
        format: "geojson",
        starttime,
        minmagnitude: minMagnitude,
        orderby: "time",
        limit: 500,
      },
      headers: { Accept: "application/geo+json, application/json" },
    });
    if (!Array.isArray(response.data?.features)) {
      throw new Error("USGS returned an invalid event feed");
    }

    const payload = {
      events: response.data.features.map(normalizeFeature).filter(Boolean),
      source: SOURCE,
      retrievedAt: new Date().toISOString(),
      stale: false,
    };
    cache.set(key, { payload, cachedAt: Date.now() });
    pruneCache(Date.now());
    return res.json(payload);
  } catch (err) {
    if (cached && Date.now() - cached.cachedAt <= MAX_STALE_MS) {
      return res.json({
        ...cached.payload,
        stale: true,
        warning: "USGS could not be refreshed; showing the last successful retrieval.",
      });
    }
    const error = new Error("USGS observations are currently unavailable");
    error.status = 502;
    return next(error);
  }
};
