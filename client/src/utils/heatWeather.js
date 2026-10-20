export const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export function buildWeatherLocations(latitude, longitude, radiusKm) {
  const latStep = radiusKm / 2 / 111.32;
  const lonStep = radiusKm / 2 / (111.32 * Math.max(0.1, Math.abs(Math.cos((latitude * Math.PI) / 180))));
  return [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({
    latitude: row === 0 && col === 0
      ? latitude
      : Number(Math.max(-85, Math.min(85, latitude + row * latStep)).toFixed(4)),
    longitude: row === 0 && col === 0
      ? longitude
      : Number((((longitude + col * lonStep + 540) % 360) - 180).toFixed(4)),
    row,
    col,
  })));
}

function finiteOrNull(value) {
  const result = value === null || value === undefined ? NaN : Number(value);
  return Number.isFinite(result) ? result : null;
}

export function normalizeOpenMeteoLocation(data, point) {
  const current = data?.current;
  const temperatureC = finiteOrNull(current?.temperature_2m);
  if (temperatureC === null) return null;

  const daily = data.daily || {};
  const localDate = typeof current.time === "string" ? current.time.slice(0, 10) : null;
  const dailyTimes = Array.isArray(daily.time) ? daily.time : [];
  const dayIndex = localDate ? dailyTimes.indexOf(localDate) : -1;
  const hourly = data.hourly || {};
  const hourlyTimes = Array.isArray(hourly.time) ? hourly.time : [];
  const startIndex = hourlyTimes.findIndex((time) => typeof current.time === "string" && time >= current.time);
  const forecast = startIndex < 0 ? [] : hourlyTimes.slice(startIndex, startIndex + 8).flatMap((time, offset) => {
    const index = startIndex + offset;
    const forecastTemperature = finiteOrNull(hourly.temperature_2m?.[index]);
    return forecastTemperature === null ? [] : [{
      time,
      temperatureC: forecastTemperature,
      apparentTemperatureC: finiteOrNull(hourly.apparent_temperature?.[index]),
      humidityPct: finiteOrNull(hourly.relative_humidity_2m?.[index]),
    }];
  });

  return {
    ...point,
    temperatureC,
    apparentTemperatureC: finiteOrNull(current.apparent_temperature),
    humidityPct: finiteOrNull(current.relative_humidity_2m),
    weatherCode: finiteOrNull(current.weather_code),
    windSpeedKmh: finiteOrNull(current.wind_speed_10m),
    precipitationMm: finiteOrNull(current.precipitation),
    modelTime: typeof current.time === "string" ? current.time : null,
    timezone: data.timezone || "UTC",
    dailyMaximumC: dayIndex < 0 ? null : finiteOrNull(daily.temperature_2m_max?.[dayIndex]),
    dailyMinimumC: dayIndex < 0 ? null : finiteOrNull(daily.temperature_2m_min?.[dayIndex]),
    dailyApparentMaximumC: dayIndex < 0 ? null : finiteOrNull(daily.apparent_temperature_max?.[dayIndex]),
    forecast,
  };
}

export function normalizeOpenMeteoGrid(payload, latitude, longitude, radiusKm, now = Date.now()) {
  const locations = buildWeatherLocations(latitude, longitude, radiusKm);
  const results = Array.isArray(payload) ? payload : [payload];
  if (results.length !== locations.length) {
    throw new Error(`Open-Meteo returned ${results.length} locations; expected ${locations.length}.`);
  }

  const points = results
    .map((result, index) => normalizeOpenMeteoLocation(result, locations[index]))
    .filter(Boolean);
  const center = points.find((point) => point.row === 0 && point.col === 0);
  if (!center) throw new Error("Open-Meteo did not return current temperature for the selected location.");

  return {
    points,
    center,
    requestedLocation: { latitude, longitude },
    radiusKm,
    source: "Open-Meteo Forecast API (direct fallback)",
    attribution: "Weather data by Open-Meteo, using weather forecast models.",
    retrievedAt: new Date(now).toISOString(),
    stale: false,
    warning: "The configured ArkGrid API is missing its weather route (404); weather was loaded directly from Open-Meteo.",
  };
}
