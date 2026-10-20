import axios from "axios";
import api from "./api";

const USGS_QUERY_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query";

function normalizeUsgsEvent(feature) {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties || {};
  const longitude = coordinates?.[0];
  const latitude = coordinates?.[1];
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || !Number.isFinite(properties.time)) return null;
  const magnitude = Number.isFinite(properties.mag) ? properties.mag : null;
  return {
    id: String(feature.id),
    hazardType: "earthquake",
    magnitude,
    title: magnitude == null ? "Earthquake" : `Magnitude ${magnitude.toFixed(1)}`,
    location: properties.place || "Location not reported",
    time: new Date(properties.time).toISOString(),
    updated: Number.isFinite(properties.updated) ? new Date(properties.updated).toISOString() : null,
    latitude,
    longitude,
    depthKm: Number.isFinite(coordinates[2]) ? coordinates[2] : null,
    url: properties.url || null,
    eventType: properties.type || "unknown",
    severity: properties.alert || null,
    status: properties.status || "Reported by USGS",
    tsunami: properties.tsunami === 1,
    source: "USGS Earthquake Hazards Program - FDSN Event Web Service",
  };
}

export function normalizeUsgsFeed(payload, hours, minMagnitude, now = Date.now()) {
  if (!Array.isArray(payload?.features)) throw new Error("USGS returned an invalid GeoJSON earthquake feed.");
  const generated = Number(payload.metadata?.generated);
  return {
    events: payload.features.map(normalizeUsgsEvent).filter(Boolean),
    source: "USGS Earthquake Hazards Program (direct fallback; ArkGrid API route unavailable)",
    retrievedAt: Number.isFinite(generated) ? new Date(generated).toISOString() : new Date(now).toISOString(),
    stale: false,
    warning: "The ArkGrid observations route is unavailable (404); earthquake events were loaded directly from USGS.",
  };
}

export async function getEarthquakes({ hours, minMagnitude, refresh = false, signal }) {
  try {
    const response = await api.get("/api/observations/earthquakes", {
      params: { hours, minMagnitude, ...(refresh ? { refresh: 1 } : {}) },
      signal,
      timeout: 15000,
    });
    return response.data;
  } catch (apiError) {
    if (apiError.response?.status !== 404 || signal?.aborted) throw apiError;
    const response = await axios.get(USGS_QUERY_URL, {
      timeout: 15000,
      signal,
      params: {
        format: "geojson",
        starttime: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
        minmagnitude: minMagnitude,
        orderby: "time",
        limit: 500,
      },
      headers: { Accept: "application/geo+json, application/json" },
    });
    return normalizeUsgsFeed(response.data, hours, minMagnitude);
  }
}

export async function getGlobalHazards({ hours, refresh = false, signal }) {
  const response = await api.get("/api/observations/hazards", {
    params: { hours, ...(refresh ? { refresh: 1 } : {}) },
    signal,
    timeout: 15000,
  });
  return response.data;
}
