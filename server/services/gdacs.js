const axios = require("axios");

const SOURCE = "Global Disaster Alert and Coordination System (GDACS)";
const FEED_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const CACHE_TTL_MS = Number(process.env.GDACS_CACHE_TTL_MS) > 0
  ? Number(process.env.GDACS_CACHE_TTL_MS)
  : 5 * 60 * 1000;
const MAX_STALE_MS = 60 * 60 * 1000;
const ALLOWED_HOURS = new Set([24, 168, 720]);
const cache = new Map();

function parseProviderDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const utcValue = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  const time = Date.parse(utcValue);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeFeature(feature, now = Date.now()) {
  const [longitude, latitude] = feature?.geometry?.coordinates || [];
  const properties = feature?.properties || {};
  const eventCode = String(properties.eventtype || "").toUpperCase();
  const eventId = properties.eventid;
  if (!["FL", "TC"].includes(eventCode)
    || eventId === undefined || eventId === null || String(eventId).trim() === ""
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;

  const time = parseProviderDate(properties.fromdate);
  if (!time) return null;
  const currentValue = properties.iscurrent;
  const expiresAt = parseProviderDate(properties.todate);
  const providerSaysCurrent = currentValue === true || currentValue === 1
    || currentValue === "1" || currentValue === "true";
  const isCurrent = providerSaysCurrent && (!expiresAt || Date.parse(expiresAt) > now);
  const eventType = eventCode === "FL" ? "flood" : "cyclone";
  const url = properties.url || {};

  return {
    id: `gdacs-${eventCode}-${eventId}-${properties.episodeid || "0"}`,
    hazardType: eventType,
    title: properties.name || properties.description || (eventType === "flood" ? "Flood alert" : "Tropical cyclone alert"),
    location: properties.country || properties.name || "Location not reported",
    time,
    updated: parseProviderDate(properties.datemodified),
    expiresAt,
    latitude,
    longitude,
    severity: ["Green", "Orange", "Red"].includes(properties.alertlevel) ? properties.alertlevel : null,
    status: isCurrent ? "Ongoing (GDACS)" : "Recent event (not marked current by GDACS)",
    source: typeof properties.source === "string" && properties.source ? properties.source : SOURCE,
    url: url.report || url.details || null,
  };
}

function filterWindow(events, hours, now = Date.now()) {
  const cutoff = now - hours * 60 * 60 * 1000;
  return events.filter((event) => {
    const expiry = event.expiresAt ? Date.parse(event.expiresAt) : null;
    if (event.status === "Ongoing (GDACS)" && (!expiry || expiry > now)) return true;
    const time = Date.parse(event.time);
    return Number.isFinite(time) && time >= cutoff && time <= now + 60000;
  });
}

function dedupeEvents(events) {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

async function getHazardAlerts(hours = 24, forceRefresh = false) {
  if (!ALLOWED_HOURS.has(hours)) {
    throw Object.assign(new Error("hours must be 24, 168, or 720"), { status: 400 });
  }

  const key = String(hours);
  const now = Date.now();
  const cached = cache.get(key);
  if (!forceRefresh && cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return { ...cached.payload, stale: false };
  }

  try {
    const fromDate = new Date(now - hours * 60 * 60 * 1000).toISOString().slice(0, 10);
    const response = await axios.get(FEED_URL, {
      timeout: 12000,
      params: {
        eventlist: "FL;TC",
        fromDate,
        toDate: new Date(now).toISOString().slice(0, 10),
        alertlevel: "Green;Orange;Red",
        output: "geojson",
      },
      headers: { Accept: "application/geo+json, application/json" },
    });
    if (response.data?.type !== "FeatureCollection" || !Array.isArray(response.data.features)) {
      throw new Error("GDACS returned an invalid GeoJSON feature collection");
    }

    const payload = {
      events: dedupeEvents(filterWindow(
        response.data.features.map((feature) => normalizeFeature(feature, now)).filter(Boolean),
        hours,
        now
      )),
      source: SOURCE,
      retrievedAt: new Date().toISOString(),
      stale: false,
    };
    cache.set(key, { payload, cachedAt: Date.now() });
    while (cache.size > 10) cache.delete(cache.keys().next().value);
    return payload;
  } catch (cause) {
    if (cached && Date.now() - cached.cachedAt <= MAX_STALE_MS) {
      return {
        ...cached.payload,
        stale: true,
        warning: "GDACS could not be refreshed; showing the last successful retrieval.",
      };
    }
    throw Object.assign(new Error("GDACS disaster alerts are currently unavailable"), {
      status: 502,
      cause,
    });
  }
}

exports.getHazardAlerts = getHazardAlerts;
exports._normalizeFeature = normalizeFeature;
exports._filterWindow = filterWindow;
exports._dedupeEvents = dedupeEvents;
