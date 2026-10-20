const axios = require("axios");
const { validCoords, distanceM } = require("../utils/geo");
const { getHazardAlerts } = require("./gdacs");

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_CACHE_TTL_MS = Number(process.env.FLOOD_WEATHER_CACHE_TTL_MS) > 0
  ? Number(process.env.FLOOD_WEATHER_CACHE_TTL_MS)
  : 10 * 60 * 1000;
const MAX_STALE_WEATHER_MS = 60 * 60 * 1000;
const REPORT_AGE_MS = 48 * 60 * 60 * 1000;
const ROAD_AGE_MS = 12 * 60 * 60 * 1000;
const weatherCache = new Map();
const weatherInFlight = new Map();

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLongitude(lng) {
  return ((lng + 540) % 360) - 180;
}

function buildSamplePoints(lat, lng, radiusKm, grid) {
  const side = ({ 10: 3, 14: 5, 20: 7 })[grid];
  const radiusM = radiusKm * 1000;
  const latStep = (radiusKm * 2) / (side - 1) / 111.32;
  const cosLat = Math.max(0.01, Math.abs(Math.cos((lat * Math.PI) / 180)));
  const lngStep = (radiusKm * 2) / (side - 1) / (111.32 * cosLat);
  const points = [];
  const seen = new Set();

  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const pointLat = Math.max(-90, Math.min(90, lat + (row - (side - 1) / 2) * latStep));
      const pointLng = normalizeLongitude(lng + (col - (side - 1) / 2) * lngStep);
      const point = { lat: Number(pointLat.toFixed(5)), lng: Number(pointLng.toFixed(5)) };
      if (distanceM({ lat, lng }, point) > radiusM + 5) continue;
      const key = `${point.lat}:${point.lng}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({ id: `sample-${points.length + 1}`, ...point });
    }
  }

  const centerKey = `${Number(lat.toFixed(5))}:${Number(lng.toFixed(5))}`;
  if (!seen.has(centerKey)) points.push({ id: `sample-${points.length + 1}`, lat, lng });
  return points;
}

function toEpoch(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const iso = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  const epoch = Date.parse(iso);
  return Number.isFinite(epoch) ? epoch : null;
}

function sumCompleteWindow(times, values, start, end, exclusiveStart) {
  if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) return null;
  const selected = [];
  for (let i = 0; i < times.length; i++) {
    const epoch = toEpoch(times[i]);
    if (epoch === null) continue;
    const afterStart = exclusiveStart ? epoch > start : epoch >= start;
    if (afterStart && epoch <= end) selected.push(values[i]);
  }
  if (selected.length !== 24) return null;
  const amounts = selected.map(finiteOrNull);
  if (amounts.some((amount) => amount === null || amount < 0)) return null;
  return Number(amounts.reduce((total, amount) => total + amount, 0).toFixed(1));
}

function normalizeWeatherLocation(data, point) {
  const current = data?.current || {};
  const currentTime = typeof current.time === "string" ? current.time : null;
  const currentEpoch = toEpoch(currentTime);
  const currentPrecipitationMm = finiteOrNull(current.precipitation);
  const hourly = data?.hourly || {};
  const hourlyTimes = hourly.time;
  const precipitation = hourly.precipitation;
  const past24Mm = currentEpoch === null
    ? null
    : sumCompleteWindow(hourlyTimes, precipitation, currentEpoch - 24 * 3600 * 1000, currentEpoch, true);
  const forecast24Mm = currentEpoch === null
    ? null
    : sumCompleteWindow(hourlyTimes, precipitation, currentEpoch, currentEpoch + 24 * 3600 * 1000, true);
  const forecastHours = [];
  if (Array.isArray(hourlyTimes) && Array.isArray(precipitation) && hourlyTimes.length === precipitation.length && currentEpoch !== null) {
    for (let i = 0; i < hourlyTimes.length; i++) {
      const epoch = toEpoch(hourlyTimes[i]);
      const amount = finiteOrNull(precipitation[i]);
      if (epoch !== null && epoch > currentEpoch && epoch <= currentEpoch + 24 * 3600 * 1000 && amount !== null && amount >= 0) {
        forecastHours.push(amount);
      }
    }
  }
  const peakForecastHourlyMm = forecastHours.length === 24 ? Number(Math.max(...forecastHours).toFixed(1)) : null;

  return {
    ...point,
    currentPrecipitationMm: currentPrecipitationMm !== null && currentPrecipitationMm >= 0
      ? currentPrecipitationMm
      : null,
    past24Mm,
    forecast24Mm,
    peakForecastHourlyMm,
    modelTime: currentTime,
  };
}

function weatherCacheKey(points, radiusKm, grid) {
  return `${radiusKm}:${grid}:${points.map(({ lat, lng }) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(";")}`;
}

async function fetchWeather(points) {
  const response = await axios.get(OPEN_METEO_URL, {
    timeout: 15000,
    params: {
      latitude: points.map((point) => point.lat).join(","),
      longitude: points.map((point) => point.lng).join(","),
      current: "precipitation",
      hourly: "precipitation",
      past_days: 1,
      forecast_days: 2,
      timezone: "UTC",
    },
    headers: { Accept: "application/json" },
  });
  const locations = Array.isArray(response.data) ? response.data : [response.data];
  if (locations.length !== points.length) {
    throw new Error(`Open-Meteo returned ${locations.length} locations; expected ${points.length}`);
  }
  return locations.map((location, index) => normalizeWeatherLocation(location, points[index]));
}

async function getWeather(points, radiusKm, grid) {
  const key = weatherCacheKey(points, radiusKm, grid);
  const now = Date.now();
  const cached = weatherCache.get(key);
  if (cached && now - cached.cachedAt < WEATHER_CACHE_TTL_MS) {
    return { ...cached.payload, stale: false };
  }
  if (weatherInFlight.has(key)) return weatherInFlight.get(key);

  const request = (async () => {
    try {
      const payload = {
        points: await fetchWeather(points),
        source: "Open-Meteo Forecast API (weather-model output; not station observations)",
        retrievedAt: new Date().toISOString(),
        stale: false,
      };
      weatherCache.set(key, { payload, cachedAt: Date.now() });
      while (weatherCache.size > 100) weatherCache.delete(weatherCache.keys().next().value);
      return payload;
    } catch (err) {
      console.error("[flood-monitor] Open-Meteo request failed", {
        status: err.response?.status || null,
        code: err.code || null,
        message: err.message,
      });
      if (cached && Date.now() - cached.cachedAt <= MAX_STALE_WEATHER_MS) {
        return {
          ...cached.payload,
          stale: true,
          warning: "Open-Meteo could not be refreshed; showing its last successful model output.",
        };
      }
      throw Object.assign(new Error("Open-Meteo precipitation data is currently unavailable"), { cause: err });
    } finally {
      weatherInFlight.delete(key);
    }
  })();
  weatherInFlight.set(key, request);
  return request;
}

function timestampMillis(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  const valueMillis = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(valueMillis) ? valueMillis : null;
}

async function readVerifiedReports(now) {
  const { db } = require("../config/firebaseAdmin");
  const snapshot = await db.collection("reports").orderBy("createdAt", "desc").limit(200).get();
  const reports = [];
  for (const document of snapshot.docs) {
    const report = document.data();
    const createdAtMs = timestampMillis(report.createdAt);
    const lat = report.lat == null ? Number.NaN : Number(report.lat);
    const lng = report.lng == null ? Number.NaN : Number(report.lng);
    if (report.status !== "verified" || report.type !== "submerged_road"
      || createdAtMs === null || now - createdAtMs < 0 || now - createdAtMs > REPORT_AGE_MS
      || !validCoords(lat, lng)) continue;
    reports.push({
      id: `report-${document.id}`,
      title: "Verified submerged-road report",
      description: typeof report.description === "string" ? report.description : "",
      lat,
      lng,
      status: report.status,
      reportedAt: new Date(createdAtMs).toISOString(),
      source: "ArkGrid verified user report",
    });
  }
  return reports;
}

async function readVerifiedFloodedRoads(now) {
  const { db } = require("../config/firebaseAdmin");
  const snapshot = await db.collection("roads").orderBy("updatedAt", "desc").limit(300).get();
  const roads = [];
  for (const document of snapshot.docs) {
    const road = document.data();
    const updatedAtMs = timestampMillis(road.updatedAt);
    if (!road.verified || road.status !== "flooded"
      || updatedAtMs === null || now - updatedAtMs < 0 || now - updatedAtMs > ROAD_AGE_MS
      || !Array.isArray(road.coords)) continue;
    const coords = road.coords
      .map((point) => ({
        lat: point?.lat == null ? Number.NaN : Number(point.lat),
        lng: point?.lng == null ? Number.NaN : Number(point.lng),
      }))
      .filter((point) => validCoords(point.lat, point.lng));
    if (coords.length === 0) continue;
    roads.push(...coords.map((point, index) => ({
      id: `road-${document.id}-${index + 1}`,
      title: road.name || "Verified flooded-road report",
      description: typeof road.note === "string" ? road.note : "",
      lat: point.lat,
      lng: point.lng,
      status: road.status,
      reportedAt: new Date(updatedAtMs).toISOString(),
      source: "ArkGrid verified road report",
    })));
  }
  return roads;
}

async function getFieldReports(now) {
  const readResults = await Promise.allSettled([
    readVerifiedReports(now),
    readVerifiedFloodedRoads(now),
  ]);
  const reportsAvailable = readResults[0].status === "fulfilled";
  const roadsAvailable = readResults[1].status === "fulfilled";
  for (const [index, result] of readResults.entries()) {
    if (result.status === "rejected") {
      console.error(`[flood-monitor] ArkGrid ${index === 0 ? "reports" : "roads"} query failed`, result.reason?.message);
    }
  }
  return {
    reports: reportsAvailable ? readResults[0].value : [],
    roads: roadsAvailable ? readResults[1].value : [],
    sources: {
      reports: {
        available: reportsAvailable,
        source: "ArkGrid verified submerged-road reports",
        retrievedAt: new Date().toISOString(),
      },
      roads: {
        available: roadsAvailable,
        source: "ArkGrid verified flooded-road records",
        retrievedAt: new Date().toISOString(),
      },
    },
  };
}

function withinRadius(point, center, radiusM) {
  return distanceM({ lat: point.lat ?? point.latitude, lng: point.lng ?? point.longitude }, center) <= radiusM;
}

const THRESHOLDS = {
  // Documented India Meteorological Department (IMD) / WMO heavy rainfall warning thresholds:
  HEAVY_RAIN_24H_MM: Number(process.env.FLOOD_HEAVY_RAIN_24H_MM) || 64.5,
  VERY_HEAVY_RAIN_24H_MM: Number(process.env.FLOOD_VERY_HEAVY_RAIN_24H_MM) || 115.6,
  HEAVY_RAIN_1H_MM: Number(process.env.FLOOD_HEAVY_RAIN_1H_MM) || 20.0,
  TORRENTIAL_RAIN_1H_MM: Number(process.env.FLOOD_TORRENTIAL_RAIN_1H_MM) || 40.0,
};

function isCurrentEvent(event, now) {
  if (event.status !== "Ongoing (GDACS)") return false;
  return !event.expiresAt || Date.parse(event.expiresAt) > now;
}

function monitoringStatus({
  weather,
  alerts,
  reports,
  nearbyReports,
  nearbyRoads,
  activeFloodAlerts,
  maxForecast24Mm = null,
  maxPeakHourlyMm = null,
  past24MaxMm = null,
}) {
  // 1. Confirmed inundation observations (RED)
  if (nearbyReports.length || nearbyRoads.length) {
    const count = nearbyReports.length + nearbyRoads.length;
    return {
      status: "RED",
      basis: "observation",
      summary: "A verified submerged-road or flooded-road report is confirmed in this area.",
      explanation: `${count} verified on-the-ground report(s) confirm active flooding or submerged road conditions.`,
    };
  }

  // 2. High severity official flood warning (RED)
  if (activeFloodAlerts.some((event) => event.severity === "Red")) {
    const redAlert = activeFloodAlerts.find((event) => event.severity === "Red");
    return {
      status: "RED",
      basis: "official_alert",
      summary: "An active GDACS Red flood alert is present in this area.",
      explanation: `Active high-severity official flood warning: ${redAlert.title} (${redAlert.location}).`,
    };
  }

  // 3. Extreme rainfall forecast (RED)
  if (maxForecast24Mm !== null && (maxForecast24Mm >= THRESHOLDS.VERY_HEAVY_RAIN_24H_MM || (maxPeakHourlyMm !== null && maxPeakHourlyMm >= THRESHOLDS.TORRENTIAL_RAIN_1H_MM))) {
    return {
      status: "RED",
      basis: "forecast",
      summary: `Extreme rainfall forecast (up to ${maxForecast24Mm.toFixed(1)} mm/24h or ${maxPeakHourlyMm ? maxPeakHourlyMm.toFixed(1) : 0} mm/h).`,
      explanation: `Rainfall model estimates meet IMD very heavy/torrential rainfall criteria (≥${THRESHOLDS.VERY_HEAVY_RAIN_24H_MM} mm/24h or ≥${THRESHOLDS.TORRENTIAL_RAIN_1H_MM} mm/h); high risk of flash flooding.`,
    };
  }

  // 4. Official flood watch or orange alert (YELLOW)
  if (activeFloodAlerts.some((event) => event.severity === "Orange")) {
    const orangeAlert = activeFloodAlerts.find((event) => event.severity === "Orange");
    return {
      status: "YELLOW",
      basis: "official_alert",
      summary: "An active GDACS Orange flood alert is present in this area.",
      explanation: `Official flood watch advisory: ${orangeAlert.title} (${orangeAlert.location}).`,
    };
  }

  // 5. Heavy rainfall alert/watch (YELLOW)
  if (maxForecast24Mm !== null && (maxForecast24Mm >= THRESHOLDS.HEAVY_RAIN_24H_MM || (maxPeakHourlyMm !== null && maxPeakHourlyMm >= THRESHOLDS.HEAVY_RAIN_1H_MM) || (past24MaxMm !== null && past24MaxMm >= THRESHOLDS.HEAVY_RAIN_24H_MM))) {
    return {
      status: "YELLOW",
      basis: "forecast",
      summary: `Heavy rainfall alert threshold met (up to ${maxForecast24Mm.toFixed(1)} mm/24h or ${maxPeakHourlyMm ? maxPeakHourlyMm.toFixed(1) : 0} mm/h).`,
      explanation: `Forecast or recent rainfall meets documented IMD heavy rain criteria (≥${THRESHOLDS.HEAVY_RAIN_24H_MM} mm/24h or ≥${THRESHOLDS.HEAVY_RAIN_1H_MM} mm/h); local pooling or localized flooding watch.`,
    };
  }

  // 6. Complete, fresh, verified negative data (GREEN)
  const completeWeather = weather.available && !weather.stale
    && weather.points.length > 0
    && weather.points.every((point) => point.currentPrecipitationMm !== null
      && point.past24Mm !== null && point.forecast24Mm !== null && point.peakForecastHourlyMm !== null);
  const completeFieldSources = reports.sources.reports.available && reports.sources.roads.available;
  const knownSeverity = activeFloodAlerts.every((event) => event.severity !== null);

  if (completeWeather && alerts.available && !alerts.stale && completeFieldSources && knownSeverity) {
    return {
      status: "GREEN",
      basis: "observation",
      summary: "No active official flood alerts, verified flood reports, or heavy rainfall detected.",
      explanation: `All data sources are fresh and operational. Rainfall estimates remain below warning thresholds (<${THRESHOLDS.HEAVY_RAIN_24H_MM} mm/24h), with no active alerts.`,
    };
  }

  // 7. Missing or incomplete data (UNKNOWN)
  return {
    status: "UNKNOWN",
    basis: "insufficient_data",
    summary: "Coverage is incomplete; current flood conditions cannot be classified from the available sources.",
    explanation: "One or more external data feeds are missing, stale, or incomplete. Missing data is never classified as safe (GREEN).",
  };
}

function buildGridCells({
  centerLat,
  centerLng,
  radiusKm,
  grid,
  weatherPoints,
  activeFloodAlerts,
  nearbyReports,
  nearbyRoads,
  weatherAvailable,
  weatherStale,
}) {
  const n = [10, 14, 20].includes(grid) ? grid : 14;
  const radiusM = radiusKm * 1000;
  const latSpan = (radiusKm * 2) / 111.32;
  const cosLat = Math.max(0.01, Math.abs(Math.cos((centerLat * Math.PI) / 180)));
  const lngSpan = (radiusKm * 2) / (111.32 * cosLat);
  const dLat = latSpan / n;
  const dLng = lngSpan / n;
  const cellSizeM = Math.round((2 * radiusM) / n);

  const south = Math.max(-90, centerLat - latSpan / 2);
  const north = Math.min(90, centerLat + latSpan / 2);
  const west = normalizeLongitude(centerLng - lngSpan / 2);
  const east = normalizeLongitude(centerLng + lngSpan / 2);

  const cells = [];
  const counts = { GREEN: 0, YELLOW: 0, RED: 0, UNKNOWN: 0 };

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cellLat = Math.max(-90, Math.min(90, south + (i + 0.5) * dLat));
      const cellLng = normalizeLongitude(west + (j + 0.5) * dLng);

      // Find nearest weather sample point
      let nearestSample = null;
      let minSampleDist = Infinity;
      for (const pt of weatherPoints) {
        const d = distanceM({ lat: cellLat, lng: cellLng }, { lat: pt.lat, lng: pt.lng });
        if (d < minSampleDist) {
          minSampleDist = d;
          nearestSample = pt;
        }
      }

      const rain24Mm = nearestSample?.forecast24Mm ?? null;
      const past24Mm = nearestSample?.past24Mm ?? null;
      const peakHourlyMm = nearestSample?.peakForecastHourlyMm ?? null;
      const currentPrecipitationMm = nearestSample?.currentPrecipitationMm ?? null;

      // Check verified reports within or near cell
      const cellReport = nearbyReports.find((r) => distanceM({ lat: cellLat, lng: cellLng }, { lat: r.lat, lng: r.lng }) <= Math.max(cellSizeM * 0.9, 500))
        || nearbyRoads.find((r) => distanceM({ lat: cellLat, lng: cellLng }, { lat: r.lat, lng: r.lng }) <= Math.max(cellSizeM * 0.9, 500));

      // Check active GDACS alerts intersecting cell
      const cellAlert = activeFloodAlerts.find((a) => distanceM({ lat: cellLat, lng: cellLng }, { lat: a.latitude, lng: a.longitude }) <= Math.max(cellSizeM * 1.5, 5000));

      let status = "GREEN";
      let basis = "observation";
      let reason = "Low detected risk; no active alerts or heavy rain.";
      let color = "#4ade80";
      let fillOpacity = 0.20;

      if (cellReport) {
        status = "RED";
        basis = "observation";
        reason = `Confirmed inundation: ${cellReport.title || "verified flooded road"} at this location.`;
        color = "#fb7185";
        fillOpacity = 0.55;
      } else if (cellAlert && cellAlert.severity === "Red") {
        status = "RED";
        basis = "official_alert";
        reason = `Official alert: Active GDACS Red flood alert (${cellAlert.title}).`;
        color = "#fb7185";
        fillOpacity = 0.50;
      } else if (rain24Mm !== null && (rain24Mm >= THRESHOLDS.VERY_HEAVY_RAIN_24H_MM || (peakHourlyMm !== null && peakHourlyMm >= THRESHOLDS.TORRENTIAL_RAIN_1H_MM))) {
        status = "RED";
        basis = "forecast";
        reason = `Extreme rainfall forecast (model estimate: ${rain24Mm.toFixed(1)} mm/24h or ${peakHourlyMm ? peakHourlyMm.toFixed(1) : 0} mm/h).`;
        color = "#fb7185";
        fillOpacity = 0.45;
      } else if (cellAlert && cellAlert.severity === "Orange") {
        status = "YELLOW";
        basis = "official_alert";
        reason = `Official alert: Active GDACS Orange flood alert (${cellAlert.title}).`;
        color = "#fbbf24";
        fillOpacity = 0.40;
      } else if (rain24Mm !== null && (rain24Mm >= THRESHOLDS.HEAVY_RAIN_24H_MM || (peakHourlyMm !== null && peakHourlyMm >= THRESHOLDS.HEAVY_RAIN_1H_MM) || (past24Mm !== null && past24Mm >= THRESHOLDS.HEAVY_RAIN_24H_MM))) {
        status = "YELLOW";
        basis = "forecast";
        reason = `Heavy rain alert threshold met (model estimate: ${rain24Mm.toFixed(1)} mm/24h or ${peakHourlyMm ? peakHourlyMm.toFixed(1) : 0} mm/h).`;
        color = "#fbbf24";
        fillOpacity = 0.35;
      } else if (weatherAvailable && !weatherStale && nearestSample?.dataQuality === "available") {
        status = "GREEN";
        basis = "observation";
        reason = `Low detected risk; model rainfall is ${rain24Mm !== null ? rain24Mm.toFixed(1) : 0} mm/24h, below warning criteria.`;
        color = "#4ade80";
        fillOpacity = 0.20;
      } else {
        status = "UNKNOWN";
        basis = "insufficient_data";
        reason = "Weather or flood alert coverage is incomplete for this location.";
        color = "#94a3b8";
        fillOpacity = 0.15;
      }

      counts[status]++;

      cells.push({
        i,
        j,
        lat: Number(cellLat.toFixed(5)),
        lng: Number(cellLng.toFixed(5)),
        status,
        basis,
        reason,
        color,
        fillOpacity,
        rain24Mm,
        past24Mm,
        peakHourlyMm,
        currentPrecipitationMm,
        tier: status === "RED" ? 3 : status === "YELLOW" ? 1 : status === "GREEN" ? 0 : 0,
        score: status === "RED" ? 0.9 : status === "YELLOW" ? 0.5 : status === "GREEN" ? 0.1 : 0.0,
      });
    }
  }

  const total = cells.length;
  const pct = {
    GREEN: Number(((counts.GREEN / total) * 100).toFixed(1)),
    YELLOW: Number(((counts.YELLOW / total) * 100).toFixed(1)),
    RED: Number(((counts.RED / total) * 100).toFixed(1)),
    UNKNOWN: Number(((counts.UNKNOWN / total) * 100).toFixed(1)),
  };

  return {
    cells,
    cell: {
      dLat,
      dLng,
      size_m: cellSizeM,
    },
    bounds: { south, north, west, east },
    summary: {
      counts,
      pct,
      total,
      worst: counts.RED > 0 ? "RED" : counts.YELLOW > 0 ? "YELLOW" : counts.UNKNOWN > 0 ? "UNKNOWN" : "GREEN",
    },
  };
}

async function getFloodMonitoring({ lat, lng, radiusKm = 3, grid = 14 }, providers = {}) {
  const centerLat = Number(lat);
  const centerLng = Number(lng);
  const radius = Number(radiusKm);
  const detail = Number(grid);
  if (!validCoords(centerLat, centerLng)) throw httpError(400, "A valid location is required");
  if (!(radius >= 1 && radius <= 8)) throw httpError(400, "Radius must be between 1 and 8 km");
  if (![10, 14, 20].includes(detail)) throw httpError(400, "Detail must be Fast (10), Balanced (14), or Detailed (20)");

  const points = buildSamplePoints(centerLat, centerLng, radius, detail);
  const now = Date.now();
  const radiusM = radius * 1000;
  const monitorBounds = {
    south: Math.max(-90, centerLat - radius / 111.32),
    north: Math.min(90, centerLat + radius / 111.32),
    west: normalizeLongitude(centerLng - radius / (111.32 * Math.max(0.01, Math.abs(Math.cos((centerLat * Math.PI) / 180))))),
    east: normalizeLongitude(centerLng + radius / (111.32 * Math.max(0.01, Math.abs(Math.cos((centerLat * Math.PI) / 180))))),
  };
  const weatherProvider = providers.getWeather || getWeather;
  const alertProvider = providers.getHazardAlerts || getHazardAlerts;
  const fieldProvider = providers.getFieldReports || getFieldReports;
  const [weatherResult, alertResult, fieldResult] = await Promise.allSettled([
    weatherProvider(points, radius, detail),
    alertProvider(24),
    fieldProvider(now),
  ]);

  const weather = weatherResult.status === "fulfilled"
    ? { ...weatherResult.value, available: true }
    : {
        points: points.map((point) => ({
          ...point,
          currentPrecipitationMm: null,
          past24Mm: null,
          forecast24Mm: null,
          peakForecastHourlyMm: null,
          modelTime: null,
        })),
        source: "Open-Meteo Forecast API",
        retrievedAt: null,
        stale: false,
        available: false,
        error: "Open-Meteo precipitation data is currently unavailable.",
      };
  const alerts = alertResult.status === "fulfilled"
    ? { ...alertResult.value, available: true }
    : {
        events: [],
        source: "Global Disaster Alert and Coordination System (GDACS)",
        retrievedAt: null,
        stale: false,
        available: false,
        error: "GDACS alerts are currently unavailable.",
      };
  const fieldReports = fieldResult.status === "fulfilled"
    ? fieldResult.value
    : {
        reports: [],
        roads: [],
        sources: {
          reports: { available: false, source: "ArkGrid verified user reports", retrievedAt: null },
          roads: { available: false, source: "ArkGrid verified road reports", retrievedAt: null },
        },
      };

  const nearbyEvents = (alerts.events || []).filter((event) => withinRadius(event, { lat: centerLat, lng: centerLng }, radiusM));
  const activeFloodAlerts = nearbyEvents.filter((event) => (
    event.hazardType === "flood" && isCurrentEvent(event, now)
  ));
  const nearbyReports = fieldReports.reports.filter((report) => withinRadius(report, { lat: centerLat, lng: centerLng }, radiusM));
  const nearbyRoads = fieldReports.roads.filter((road) => withinRadius(road, { lat: centerLat, lng: centerLng }, radiusM));

  const weatherPoints = weather.points.map((point) => ({
    ...point,
    dataQuality: point.currentPrecipitationMm !== null && point.past24Mm !== null
      && point.forecast24Mm !== null && point.peakForecastHourlyMm !== null ? "available" : "incomplete",
  }));
  const precipitation = weatherPoints.flatMap((point) => (
    point.forecast24Mm === null ? [] : [point.forecast24Mm]
  ));
  const peakHourlyValues = weatherPoints.flatMap((point) => (
    point.peakForecastHourlyMm === null ? [] : [point.peakForecastHourlyMm]
  ));
  const past24Values = weatherPoints.flatMap((point) => (
    point.past24Mm === null ? [] : [point.past24Mm]
  ));

  const maxForecast24Mm = precipitation.length ? Math.max(...precipitation) : null;
  const minForecast24Mm = precipitation.length ? Math.min(...precipitation) : null;
  const maxPeakHourlyMm = peakHourlyValues.length ? Math.max(...peakHourlyValues) : null;
  const past24MaxMm = past24Values.length ? Math.max(...past24Values) : null;

  const classification = monitoringStatus({
    weather,
    alerts,
    reports: fieldReports,
    nearbyReports,
    nearbyRoads,
    activeFloodAlerts,
    maxForecast24Mm,
    maxPeakHourlyMm,
    past24MaxMm,
  });

  const gridData = buildGridCells({
    centerLat,
    centerLng,
    radiusKm: radius,
    grid: detail,
    weatherPoints,
    activeFloodAlerts,
    nearbyReports,
    nearbyRoads,
    weatherAvailable: weather.available,
    weatherStale: weather.stale,
  });

  const screenedFieldReports = [...nearbyReports, ...nearbyRoads];

  return {
    center: { lat: centerLat, lng: centerLng },
    radiusKm: radius,
    grid: detail,
    sampleCount: points.length,
    bounds: gridData.bounds || monitorBounds,
    cells: gridData.cells,
    cell: gridData.cell,
    zoneSummary: gridData.summary,
    ...classification,
    generatedAt: new Date().toISOString(),
    thresholds: {
      heavyRain24hMm: THRESHOLDS.HEAVY_RAIN_24H_MM,
      veryHeavyRain24hMm: THRESHOLDS.VERY_HEAVY_RAIN_24H_MM,
      heavyRain1hMm: THRESHOLDS.HEAVY_RAIN_1H_MM,
      torrentialRain1hMm: THRESHOLDS.TORRENTIAL_RAIN_1H_MM,
      standard: "IMD / WMO severe weather rainfall warning criteria",
    },
    analysisMethods: [
      {
        id: "weather_screen",
        name: "Real-Data Weather Screening (Open-Meteo)",
        available: weather.available,
        stale: weather.stale,
        retrievedAt: weather.retrievedAt,
        type: "weather_model_forecast",
      },
      {
        id: "gdacs_alerts",
        name: "Official Disaster Alerts (GDACS Flood/Cyclone)",
        available: alerts.available,
        stale: alerts.stale,
        retrievedAt: alerts.retrievedAt,
        type: "official_alert_feed",
      },
      {
        id: "field_reports",
        name: "ArkGrid Verified Inundation Field Reports",
        available: fieldReports.sources.reports.available && fieldReports.sources.roads.available,
        retrievedAt: fieldReports.sources.reports.retrievedAt,
        type: "ground_observation",
      },
      {
        id: "ml_susceptibility",
        name: "ML Terrain Susceptibility Model (90 m DEM)",
        available: false,
        type: "optional_model",
        note: "Optional supporting component; live monitoring operates independently.",
      },
    ],
    weather: {
      source: weather.source,
      available: weather.available,
      retrievedAt: weather.retrievedAt || null,
      stale: !!weather.stale,
      warning: weather.warning || null,
      error: weather.error || null,
      points: weatherPoints,
      coverage: {
        complete: weatherPoints.length === points.length && weatherPoints.length > 0
          && weatherPoints.every((point) => point.dataQuality === "available"),
        availableSamples: weatherPoints.filter((point) => point.dataQuality === "available").length,
        totalSamples: weatherPoints.length,
        minForecast24Mm,
        maxForecast24Mm,
        maxPeakHourlyMm,
        past24MaxMm,
      },
    },
    alerts: {
      source: alerts.source,
      available: alerts.available,
      retrievedAt: alerts.retrievedAt || null,
      stale: !!alerts.stale,
      warning: alerts.warning || null,
      error: alerts.error || null,
      events: nearbyEvents,
    },
    fieldReports: {
      reports: screenedFieldReports,
      sources: fieldReports.sources,
    },
    interpretation: [
      "Open-Meteo precipitation is weather-model output, not a rain-gauge sensor observation.",
      `Documented IMD/WMO warning criteria applied: Heavy Rain ≥${THRESHOLDS.HEAVY_RAIN_24H_MM} mm/24h (Yellow Watch), Very Heavy Rain ≥${THRESHOLDS.VERY_HEAVY_RAIN_24H_MM} mm/24h (Red Warning), Torrential Hourly ≥${THRESHOLDS.TORRENTIAL_RAIN_1H_MM} mm/h (Red Flash Flood Alert).`,
      "GDACS event centroids and ArkGrid field markers identify reported locations, not full flood extents.",
      "Confirmed flood observations (verified reports) are clearly distinguished from high-risk rainfall forecasts.",
      "GREEN means no elevated signals were detected by available sources; it is not a safety clearance.",
      "Missing or stale data is categorized as UNKNOWN rather than GREEN.",
    ],
  };
}

exports.getFloodMonitoring = getFloodMonitoring;
exports._buildSamplePoints = buildSamplePoints;
exports._distanceMeters = distanceM;
exports._normalizeWeatherLocation = normalizeWeatherLocation;
exports._sumCompleteWindow = sumCompleteWindow;
exports._monitoringStatus = monitoringStatus;
exports._buildGridCells = buildGridCells;
exports.THRESHOLDS = THRESHOLDS;
