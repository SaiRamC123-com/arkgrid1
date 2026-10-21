// Live RAIN zones for the Flood Risk map, built in the browser from Open-Meteo rainfall.
// Used only when the ArkGrid server could not get rainfall (its cells are all Unknown).
// Colours follow the same documented IMD / WMO heavy-rainfall thresholds as the server monitor.
// They describe forecast / recent RAINFALL. They do not show that flooding is happening.

import axios from "axios";

export const RAIN_ZONES_URL = "https://api.open-meteo.com/v1/forecast";
export const RAIN_THRESHOLDS = {
  HEAVY_24H_MM: 64.5,
  VERY_HEAVY_24H_MM: 115.6,
  HEAVY_1H_MM: 20,
  TORRENTIAL_1H_MM: 40,
};
const SIDE = { 10: 3, 14: 5, 20: 7 };
const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const wrapLng = (lng) => ((lng + 540) % 360) - 180;

export function distanceM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function buildSamplePoints(lat, lng, radiusKm, grid) {
  const side = SIDE[grid] || 5;
  const latStep = (radiusKm * 2) / (side - 1) / 111.32;
  const cosLat = Math.max(0.01, Math.abs(Math.cos(toRad(lat))));
  const lngStep = (radiusKm * 2) / (side - 1) / (111.32 * cosLat);
  const points = [];
  const seen = new Set();
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const p = {
        lat: Number(Math.max(-90, Math.min(90, lat + (row - (side - 1) / 2) * latStep)).toFixed(5)),
        lng: Number(wrapLng(lng + (col - (side - 1) / 2) * lngStep).toFixed(5)),
      };
      if (distanceM({ lat, lng }, p) > radiusKm * 1000 + 5) continue;
      const key = `${p.lat}:${p.lng}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({ id: `rain-${points.length + 1}`, ...p });
    }
  }
  const centerKey = `${Number(lat.toFixed(5))}:${Number(lng.toFixed(5))}`;
  if (!seen.has(centerKey)) points.push({ id: `rain-${points.length + 1}`, lat, lng });
  return points;
}

const toEpoch = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const iso = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

// Sum exactly 24 hourly values in (start, end]; anything missing makes the whole window unknown.
function sumWindow(times, values, start, end) {
  if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) return null;
  const picked = [];
  times.forEach((t, i) => {
    const e = toEpoch(t);
    if (e !== null && e > start && e <= end) picked.push(finiteOrNull(values[i]));
  });
  if (picked.length !== 24 || picked.some((v) => v === null || v < 0)) return null;
  return Number(picked.reduce((a, b) => a + b, 0).toFixed(1));
}

export function normalizeRainSample(data, point) {
  const currentTime = typeof data?.current?.time === "string" ? data.current.time : null;
  const now = toEpoch(currentTime);
  const times = data?.hourly?.time;
  const rain = data?.hourly?.precipitation;
  const DAY = 24 * 3600 * 1000;
  const past24Mm = now === null ? null : sumWindow(times, rain, now - DAY, now);
  const forecast24Mm = now === null ? null : sumWindow(times, rain, now, now + DAY);
  let peak = null;
  if (now !== null && Array.isArray(times) && Array.isArray(rain) && times.length === rain.length) {
    const hours = [];
    times.forEach((t, i) => {
      const e = toEpoch(t);
      const v = finiteOrNull(rain[i]);
      if (e !== null && e > now && e <= now + DAY && v !== null && v >= 0) hours.push(v);
    });
    if (hours.length === 24) peak = Number(Math.max(...hours).toFixed(1));
  }
  const cur = finiteOrNull(data?.current?.precipitation);
  return {
    ...point,
    currentPrecipitationMm: cur !== null && cur >= 0 ? cur : null,
    past24Mm,
    forecast24Mm,
    peakForecastHourlyMm: peak,
    modelTime: currentTime,
  };
}

export function classifyRain({ forecast24Mm, peakHourlyMm, past24Mm }) {
  if (forecast24Mm === null || forecast24Mm === undefined) return { status: "UNKNOWN", color: "#94a3b8", fillOpacity: 0.15 };
  const T = RAIN_THRESHOLDS;
  if (forecast24Mm >= T.VERY_HEAVY_24H_MM || (peakHourlyMm !== null && peakHourlyMm >= T.TORRENTIAL_1H_MM)) {
    return { status: "RED", color: "#fb7185", fillOpacity: 0.45 };
  }
  if (forecast24Mm >= T.HEAVY_24H_MM || (peakHourlyMm !== null && peakHourlyMm >= T.HEAVY_1H_MM) || (past24Mm !== null && past24Mm >= T.HEAVY_24H_MM)) {
    return { status: "YELLOW", color: "#fbbf24", fillOpacity: 0.35 };
  }
  return { status: "GREEN", color: "#4ade80", fillOpacity: 0.2 };
}

const REASON = {
  RED: (s) => `Extreme rainfall forecast (model estimate: ${s.forecast24Mm.toFixed(1)} mm/24h, peak ${(s.peakForecastHourlyMm ?? 0).toFixed(1)} mm/h). Rain forecast only; not a confirmed flood.`,
  YELLOW: (s) => `Heavy rainfall threshold met (model estimate: ${s.forecast24Mm.toFixed(1)} mm/24h, peak ${(s.peakForecastHourlyMm ?? 0).toFixed(1)} mm/h; past 24 h ${s.past24Mm === null ? "unknown" : `${s.past24Mm.toFixed(1)} mm`}). Rain forecast only; not a confirmed flood.`,
  GREEN: (s) => `Model rainfall ${s.forecast24Mm.toFixed(1)} mm/24h, below heavy-rain thresholds. This is not a safety clearance.`,
  UNKNOWN: () => "Rainfall data is missing for this location, so it is not classified.",
};

export function buildRainCells({ lat, lng, radiusKm, grid, samples }) {
  const n = [10, 14, 20].includes(grid) ? grid : 14;
  const latSpan = (radiusKm * 2) / 111.32;
  const cosLat = Math.max(0.01, Math.abs(Math.cos(toRad(lat))));
  const lngSpan = (radiusKm * 2) / (111.32 * cosLat);
  const dLat = latSpan / n;
  const dLng = lngSpan / n;
  const south = Math.max(-90, lat - latSpan / 2);
  const north = Math.min(90, lat + latSpan / 2);
  const west = wrapLng(lng - lngSpan / 2);
  const east = wrapLng(lng + lngSpan / 2);
  const counts = { GREEN: 0, YELLOW: 0, RED: 0, UNKNOWN: 0 };
  const cells = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cLat = Math.max(-90, Math.min(90, south + (i + 0.5) * dLat));
      const cLng = wrapLng(west + (j + 0.5) * dLng);
      let nearest = null;
      let best = Infinity;
      for (const s of samples) {
        const d = distanceM({ lat: cLat, lng: cLng }, s);
        if (d < best) { best = d; nearest = s; }
      }
      const verdict = classifyRain({
        forecast24Mm: nearest?.forecast24Mm ?? null,
        peakHourlyMm: nearest?.peakForecastHourlyMm ?? null,
        past24Mm: nearest?.past24Mm ?? null,
      });
      counts[verdict.status]++;
      cells.push({
        i, j,
        lat: Number(cLat.toFixed(5)),
        lng: Number(cLng.toFixed(5)),
        status: verdict.status,
        basis: "rain_forecast",
        reason: REASON[verdict.status](nearest || {}),
        color: verdict.color,
        fillOpacity: verdict.fillOpacity,
        rain24Mm: nearest?.forecast24Mm ?? null,
        past24Mm: nearest?.past24Mm ?? null,
        peakHourlyMm: nearest?.peakForecastHourlyMm ?? null,
        currentPrecipitationMm: nearest?.currentPrecipitationMm ?? null,
        tier: verdict.status === "RED" ? 3 : verdict.status === "YELLOW" ? 1 : 0,
        score: verdict.status === "RED" ? 0.9 : verdict.status === "YELLOW" ? 0.5 : verdict.status === "GREEN" ? 0.1 : 0,
      });
    }
  }
  const total = cells.length;
  const pct = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(((v / total) * 100).toFixed(1))]));
  return {
    cells,
    cell: { dLat, dLng, size_m: Math.round((2 * radiusKm * 1000) / n) },
    bounds: { south, north, west, east },
    summary: {
      counts, pct, total,
      worst: counts.RED ? "RED" : counts.YELLOW ? "YELLOW" : counts.UNKNOWN ? "UNKNOWN" : "GREEN",
    },
  };
}

export async function fetchRainZones({ lat, lng, radiusKm, grid, signal }) {
  const points = buildSamplePoints(lat, lng, radiusKm, grid);
  const response = await axios.get(RAIN_ZONES_URL, {
    timeout: 20000,
    signal,
    params: {
      latitude: points.map((p) => p.lat).join(","),
      longitude: points.map((p) => p.lng).join(","),
      current: "precipitation",
      hourly: "precipitation",
      past_days: 1,
      forecast_days: 2,
      timezone: "UTC",
    },
  });
  const list = Array.isArray(response.data) ? response.data : [response.data];
  if (list.length !== points.length) throw new Error(`Open-Meteo returned ${list.length} locations; expected ${points.length}`);
  const samples = list.map((data, i) => normalizeRainSample(data, points[i]));
  return {
    center: { lat, lng },
    radiusKm,
    grid,
    samples,
    generatedAt: new Date().toISOString(),
    ...buildRainCells({ lat, lng, radiusKm, grid, samples }),
  };
}

export function rainZonesMatch(rain, center, radiusKm, grid) {
  return Boolean(rain && center
    && Math.abs(rain.center.lat - center.lat) < 0.00005
    && Math.abs(rain.center.lng - center.lng) < 0.00005
    && rain.radiusKm === radiusKm && rain.grid === grid);
}

/**
 * Merge browser rain zones into the server's monitoring result, but ONLY when the server could not
 * get any rainfall (all its cells lack rain values). Official alerts and verified field reports
 * keep coming from the server; this never hides them. Returns the server result untouched otherwise.
 */
export function withRainZones(serverMonitoring, rain) {
  if (!serverMonitoring || !rain) return serverMonitoring;
  const serverHasRain = Array.isArray(serverMonitoring.cells) && serverMonitoring.cells.some((c) => c.rain24Mm !== null && c.rain24Mm !== undefined);
  if (serverHasRain) return serverMonitoring;

  const known = rain.samples.filter((s) => s.forecast24Mm !== null);
  const worst = rain.summary.worst;
  const alertsOk = serverMonitoring.alerts?.available === true;
  let status = serverMonitoring.status;
  let basis = serverMonitoring.basis;
  let summary = serverMonitoring.summary;
  let explanation = serverMonitoring.explanation;
  if (status === "UNKNOWN") {
    if (worst === "RED" || worst === "YELLOW") {
      status = worst;
      basis = "rain_forecast";
      summary = worst === "RED" ? "Extreme rainfall is forecast in part of this area." : "Heavy rainfall is forecast in part of this area.";
      explanation = "Based on Open-Meteo rainfall model output loaded in your browser against IMD heavy-rain criteria. A rain forecast is not a confirmed flood.";
    } else if (worst === "GREEN" && alertsOk) {
      status = "GREEN";
      basis = "rain_forecast";
      summary = "No heavy rainfall is forecast here and no active GDACS flood alert was found.";
      explanation = "Rainfall estimates are below heavy-rain criteria. This is not a safety clearance: it does not cover local flooding, drainage or river levels.";
    }
  }
  return {
    ...serverMonitoring,
    status, basis, summary, explanation,
    center: rain.center,
    generatedAt: rain.generatedAt,
    bounds: rain.bounds,
    cells: rain.cells,
    cell: rain.cell,
    zoneSummary: rain.summary,
    weather: {
      ...(serverMonitoring.weather || {}),
      source: "Open-Meteo Forecast API (weather-model output, loaded in your browser; not station observations)",
      points: rain.samples,
      coverage: {
        ...(serverMonitoring.weather?.coverage || {}),
        maxForecast24Mm: known.length ? Math.max(...known.map((s) => s.forecast24Mm)) : null,
        maxPeakHourlyMm: known.length ? Math.max(...known.map((s) => s.peakForecastHourlyMm ?? 0)) : null,
        past24MaxMm: known.length ? Math.max(...known.map((s) => s.past24Mm ?? 0)) : null,
      },
    },
  };
}