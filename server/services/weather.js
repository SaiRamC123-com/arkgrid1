const axios = require("axios");
const { validCoords } = require("../utils/geo");
const met = require("./metNorway");

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = Number(process.env.WEATHER_CACHE_TTL_MS) > 0
  ? Number(process.env.WEATHER_CACHE_TTL_MS)
  : 10 * 60 * 1000;
const MAX_STALE_MS = 60 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();
const SOURCE = "Open-Meteo Forecast API";

function finiteOrNull(value) {
  if (value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function buildLocations(lat, lng, radiusKm) {
  const latStep = radiusKm / 2 / 111.32;
  const lonStep = radiusKm / 2 / (111.32 * Math.max(0.1, Math.abs(Math.cos((lat * Math.PI) / 180))));
  const result = [];
  for (const row of [-1, 0, 1]) {
    for (const col of [-1, 0, 1]) {
      const pointLat = Math.max(-85, Math.min(85, lat + row * latStep));
      const pointLng = ((lng + col * lonStep + 540) % 360) - 180;
      result.push({
        latitude: row === 0 && col === 0 ? lat : Number(pointLat.toFixed(4)),
        longitude: row === 0 && col === 0 ? lng : Number(pointLng.toFixed(4)),
        row,
        col,
      });
    }
  }
  return result;
}

function cacheKey(lat, lng, radiusKm) {
return `${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm}`;
}

function normalizeLocation(data, point) {
  const current = data?.current;
  const temperature = current?.temperature_2m == null ? NaN : Number(current.temperature_2m);
  if (!Number.isFinite(temperature) || typeof current?.time !== "string") return null;
  const apparentTemperature = current.apparent_temperature == null ? NaN : Number(current.apparent_temperature);
  const humidity = current.relative_humidity_2m == null ? NaN : Number(current.relative_humidity_2m);
  const hourly = data.hourly || {};
  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];
  const hourlyTemps = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
  const hourlyApparent = Array.isArray(hourly.apparent_temperature) ? hourly.apparent_temperature : [];
  const hourlyHumidity = Array.isArray(hourly.relative_humidity_2m) ? hourly.relative_humidity_2m : [];
  const nowIndex = hourlyTimes.findIndex((time) => time >= current.time);
  const forecast = nowIndex < 0 ? [] : hourlyTimes.slice(nowIndex, nowIndex + 8).flatMap((time, index) => {
    const i = nowIndex + index;
    const value = finiteOrNull(hourlyTemps[i]);
    return value !== null
      ? [{
          time,
          temperatureC: value,
          apparentTemperatureC: finiteOrNull(hourlyApparent[i]),
          humidityPct: finiteOrNull(hourlyHumidity[i]),
        }]
      : [];
  });
  const daily = data.daily || {};
  const dailyDateIndex = Array.isArray(daily.time) ? daily.time.indexOf(current.time.slice(0, 10)) : -1;
  const dailyValue = (key) => {
    const value = dailyDateIndex < 0 ? null : daily[key]?.[dailyDateIndex];
    return value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  };

  return {
    latitude: point.latitude,
    longitude: point.longitude,
    row: point.row,
    col: point.col,
    temperatureC: temperature,
    apparentTemperatureC: Number.isFinite(apparentTemperature) ? apparentTemperature : null,
    humidityPct: Number.isFinite(humidity) ? humidity : null,
    weatherCode: finiteOrNull(current.weather_code),
    windSpeedKmh: finiteOrNull(current.wind_speed_10m),
    precipitationMm: finiteOrNull(current.precipitation),
    modelTime: current.time,
    timezone: data.timezone || "UTC",
    dailyMaximumC: dailyValue("temperature_2m_max"),
    dailyMinimumC: dailyValue("temperature_2m_min"),
    dailyApparentMaximumC: dailyValue("apparent_temperature_max"),
    forecast,
  };
}

function responsePayload(points, lat, lng, radiusKm, retrievedAt, stale, provider = {}) {
  const center = points.find((point) => point.row === 0 && point.col === 0);
  return {
    points,
    center,
    requestedLocation: { latitude: lat, longitude: lng },
    radiusKm,
    source: provider.source || SOURCE,
    attribution: provider.attribution || "Weather data by Open-Meteo, using weather forecast models.",
    retrievedAt,
    stale,
    ...(provider.warning ? { warning: provider.warning } : {}),
  };
}

async function fetchForecast(lat, lng, radiusKm) {
  const locations = buildLocations(lat, lng, radiusKm);
  try {
    const response = await axios.get(ENDPOINT, {
      timeout: 15000,
      params: {
        latitude: locations.map((point) => point.latitude).join(","),
        longitude: locations.map((point) => point.longitude).join(","),
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
        hourly: "temperature_2m,apparent_temperature,relative_humidity_2m",
        daily: "temperature_2m_max,temperature_2m_min,apparent_temperature_max",
        forecast_days: 2,
        timezone: "auto",
      },
      headers: { Accept: "application/json" },
    });

    const locationsData = Array.isArray(response.data) ? response.data : [response.data];
    if (locationsData.length !== locations.length) {
      throw new Error(`Open-Meteo returned ${locationsData.length} locations; expected ${locations.length}`);
    }
    const points = locationsData
      .map((data, index) => normalizeLocation(data, locations[index]))
      .filter(Boolean);
    if (!points.some((point) => point.row === 0 && point.col === 0)) {
      throw new Error("Open-Meteo did not return valid current temperature data for the selected location");
    }
    return points;
  } catch (err) {
    console.error("[weather] Open-Meteo forecast request failed", {
      status: err.response?.status || null,
      code: err.code || null,
      message: err.message,
    });
    throw err;
  }
}

// Keyless backup provider, used only when Open-Meteo fails (for example HTTP 429 on a shared host IP).
async function fetchMetForecast(lat, lng, radiusKm) {
  const locations = buildLocations(lat, lng, radiusKm);
  const settled = await Promise.allSettled(
    locations.map((point) =>
      axios.get(met.ENDPOINT, {
        timeout: 12000,
        params: { lat: met.coord(point.latitude), lon: met.coord(point.longitude) },
        headers: { Accept: "application/json", "User-Agent": met.userAgent() },
      })
    )
  );
  const now = Date.now();
  const points = settled.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const point = met.normalizeMetLocation(result.value.data, locations[index], now);
    return point ? [point] : [];
  });
  if (!points.some((point) => point.row === 0 && point.col === 0)) {
    const firstError = settled.find((r) => r.status === "rejected")?.reason;
    console.error("[weather] MET Norway backup request failed", {
      status: firstError?.response?.status || null,
      code: firstError?.code || null,
      message: firstError?.message || "No valid current temperature for the selected location",
    });
    throw firstError || new Error("MET Norway did not return valid current temperature data for the selected location");
  }
  return points;
}

exports.getHeatGrid = async (lat, lng, radiusKm, forceRefresh = false) => {
  if (!validCoords(lat, lng)) throw Object.assign(new Error("Valid latitude and longitude are required"), { status: 400 });
  if (![10, 25, 50].includes(radiusKm)) {
    throw Object.assign(new Error("radiusKm must be 10, 25, or 50"), { status: 400 });
  }
  const key = cacheKey(lat, lng, radiusKm);
  const now = Date.now();
  const cached = cache.get(key);
  if (!forceRefresh && cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return { ...cached.payload, stale: false };
  }
  if (inFlight.has(key)) return inFlight.get(key);

  const request = (async () => {
    try {
      let points;
      let provider = {};
      try {
        points = await fetchForecast(lat, lng, radiusKm);
      } catch (openMeteoError) {
        const status = openMeteoError.response?.status;
        // 400-level errors other than 429 mean our request was wrong; a backup would hide a real bug.
        if (status && status < 500 && status !== 429) throw openMeteoError;
        points = await fetchMetForecast(lat, lng, radiusKm);
        provider = {
          source: met.SOURCE,
          attribution: met.ATTRIBUTION,
          warning: `Open-Meteo is unavailable${status ? ` (${status})` : ""}; showing the MET Norway model forecast instead. Times are UTC and the daily maximum and apparent temperature are not provided by this source.`,
        };
      }
      const payload = responsePayload(points, lat, lng, radiusKm, new Date().toISOString(), false, provider);
      cache.set(key, { payload, cachedAt: Date.now() });
      if (cache.size > 100) cache.delete(cache.keys().next().value);
      return payload;
    } catch (err) {
      if (cached && Date.now() - cached.cachedAt <= MAX_STALE_MS) {
        console.warn("[weather] Returning the last successful grid after provider failure", {
          provider: "Open-Meteo",
          cachedAgeMs: Date.now() - cached.cachedAt,
        });
        return {
          ...cached.payload,
          stale: true,
          warning: "Weather data could not be refreshed. Showing the last successful grid.",
        };
      }
      throw Object.assign(
        new Error("Weather data is currently unavailable from Open-Meteo. Please try again shortly."),
        { status: 502, cause: err }
      );
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
};

exports._normalizeLocation = normalizeLocation;
exports._buildLocations = buildLocations;
exports._fetchMetForecast = fetchMetForecast;