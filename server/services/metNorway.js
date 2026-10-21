// MET Norway Locationforecast 2.0 (api.met.no): free, keyless backup weather source.
// Pure helpers only (no network, no axios) so they can be unit-tested offline.

const ENDPOINT = "https://api.met.no/weatherapis/locationforecast/2.0/compact";
const SOURCE = "MET Norway Locationforecast (backup; Open-Meteo unavailable)";
const ATTRIBUTION = "Weather data from MET Norway (api.met.no), licensed CC BY 4.0 / NLOD. Model forecast, not an official warning.";

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

// MET Norway asks clients to truncate coordinates to 4 decimals.
function coord(value) {
  return Number(Number(value).toFixed(4));
}

function userAgent() {
  return (process.env.WEATHER_USER_AGENT || "").trim() || "ArkGrid/1.0 github.com/SaiRamC123-com/arkgrid1";
}

function normalizeMetLocation(data, point, nowMs = Date.now()) {
  const series = Array.isArray(data?.properties?.timeseries) ? data.properties.timeseries : [];
  if (!series.length) return null;
  let index = 0;
  series.forEach((entry, i) => {
    const t = Date.parse(entry?.time);
    if (Number.isFinite(t) && t <= nowMs) index = i;
  });
  const current = series[index];
  const details = current?.data?.instant?.details;
  const temperature = finiteOrNull(details?.air_temperature);
  if (temperature === null || typeof current?.time !== "string") return null;

  const windMs = finiteOrNull(details.wind_speed);
  const precip = finiteOrNull(current.data?.next_1_hours?.details?.precipitation_amount);
  const forecast = series.slice(index, index + 8).flatMap((entry) => {
    const d = entry?.data?.instant?.details;
    const value = finiteOrNull(d?.air_temperature);
    return value === null ? [] : [{
      time: entry.time,
      temperatureC: value,
      apparentTemperatureC: null,
      humidityPct: finiteOrNull(d.relative_humidity),
    }];
  });

  return {
    latitude: point.latitude,
    longitude: point.longitude,
    row: point.row,
    col: point.col,
    temperatureC: temperature,
    apparentTemperatureC: null,
    humidityPct: finiteOrNull(details.relative_humidity),
    weatherCode: null,
    windSpeedKmh: windMs === null ? null : Math.round(windMs * 3.6 * 10) / 10,
    precipitationMm: precip,
    modelTime: current.time,
    timezone: "UTC",
    dailyMaximumC: null,
    dailyMinimumC: null,
    dailyApparentMaximumC: null,
    forecast,
  };
}

module.exports = { ENDPOINT, SOURCE, ATTRIBUTION, coord, userAgent, normalizeMetLocation };