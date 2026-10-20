import test from "node:test";
import assert from "node:assert/strict";
import { buildWeatherLocations, normalizeOpenMeteoGrid } from "./heatWeather.js";

const providerPoint = (time, overrides = {}) => ({
  current: {
    time,
    temperature_2m: 31.2,
    apparent_temperature: null,
    relative_humidity_2m: 68,
    weather_code: 2,
    wind_speed_10m: 12,
    precipitation: 0,
  },
  hourly: {
    time: [`${time.slice(0, 13)}:00`],
    temperature_2m: [31.2],
    apparent_temperature: [null],
    relative_humidity_2m: [68],
  },
  daily: {
    time: ["2026-10-16", "2026-10-17"],
    temperature_2m_max: [28, 33],
    temperature_2m_min: [18, 21],
    apparent_temperature_max: [null, 37],
  },
  timezone: "Asia/Kolkata",
  ...overrides,
});

test("grid preserves the requested center and creates nine forecast locations", () => {
  const locations = buildWeatherLocations(12.9716123, 77.5946123, 25);
  assert.equal(locations.length, 9);
  assert.deepEqual(locations.find(({ row, col }) => row === 0 && col === 0), {
    latitude: 12.9716123,
    longitude: 77.5946123,
    row: 0,
    col: 0,
  });
});

test("weather normalization selects local-day values and keeps independently missing fields", () => {
  const location = { latitude: 12.9716, longitude: 77.5946 };
  const points = buildWeatherLocations(location.latitude, location.longitude, 25);
  const data = normalizeOpenMeteoGrid(
    points.map(() => providerPoint("2026-10-17T00:00")),
    location.latitude,
    location.longitude,
    25,
    Date.parse("2026-10-17T00:01:00Z")
  );

  assert.equal(data.points.length, 9);
  assert.equal(data.center.temperatureC, 31.2);
  assert.equal(data.center.apparentTemperatureC, null);
  assert.equal(data.center.humidityPct, 68);
  assert.equal(data.center.dailyMaximumC, 33);
  assert.equal(data.center.dailyMinimumC, 21);
  assert.equal(data.center.dailyApparentMaximumC, 37);
  assert.equal(data.center.forecast[0].humidityPct, 68);
  assert.equal(data.stale, false);
});

test("normalization rejects a provider response without the center temperature", () => {
  const points = buildWeatherLocations(12.9716, 77.5946, 25);
  const payload = points.map(() => providerPoint("2026-10-17T00:00"));
  payload[4] = providerPoint("2026-10-17T00:00", {
    current: { time: "2026-10-17T00:00", temperature_2m: null },
  });
  assert.throws(
    () => normalizeOpenMeteoGrid(payload, 12.9716, 77.5946, 25),
    /did not return current temperature/
  );
});
