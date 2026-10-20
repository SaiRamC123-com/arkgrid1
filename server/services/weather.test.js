const test = require("node:test");
const assert = require("node:assert/strict");
const { _buildLocations, _normalizeLocation } = require("./weather");

test("weather grid contains nine unique coordinates and the exact selected center", () => {
  const points = _buildLocations(12.9716, 77.5946, 10);
  assert.equal(points.length, 9);
  assert.equal(new Set(points.map(({ latitude, longitude }) => `${latitude},${longitude}`)).size, 9);
  assert.deepEqual(
    points.find(({ row, col }) => row === 0 && col === 0),
    { latitude: 12.9716, longitude: 77.5946, row: 0, col: 0 }
  );
});

test("Open-Meteo fields map into the heat-grid response values", () => {
  const point = _normalizeLocation({
    current: {
      time: "2026-10-15T14:00",
      temperature_2m: 31.2,
      apparent_temperature: 35.4,
      relative_humidity_2m: 68,
      weather_code: 2,
      wind_speed_10m: 12.5,
      precipitation: 0.1,
    },
    hourly: {
      time: ["2026-10-15T14:00", "2026-10-15T15:00"],
      temperature_2m: [31.2, 32.1],
      apparent_temperature: [35.4, 36.2],
      relative_humidity_2m: [68, 66],
    },
    daily: {
      time: ["2026-10-15", "2026-10-16"],
      temperature_2m_max: [33.5, 29],
      temperature_2m_min: [20, 18],
      apparent_temperature_max: [37, 32],
    },
    timezone: "Asia/Kolkata",
  }, { latitude: 12.9716, longitude: 77.5946, row: 0, col: 0 });

  assert.equal(point.temperatureC, 31.2);
  assert.equal(point.apparentTemperatureC, 35.4);
  assert.equal(point.humidityPct, 68);
  assert.equal(point.weatherCode, 2);
  assert.equal(point.windSpeedKmh, 12.5);
  assert.equal(point.precipitationMm, 0.1);
  assert.equal(point.dailyMaximumC, 33.5);
  assert.equal(point.dailyMinimumC, 20);
  assert.equal(point.dailyApparentMaximumC, 37);
  assert.equal(point.modelTime, "2026-10-15T14:00");
  assert.equal(point.forecast.length, 2);
  assert.equal(point.forecast[0].humidityPct, 68);
});

test("incomplete provider fields remain unavailable and invalid current data is rejected", () => {
  const point = _normalizeLocation({
    current: {
      time: "2026-10-15T14:00",
      temperature_2m: 31.2,
      apparent_temperature: null,
      relative_humidity_2m: null,
    },
    daily: { temperature_2m_max: [null] },
  }, { latitude: 12.9716, longitude: 77.5946, row: 0, col: 0 });

  assert.equal(point.apparentTemperatureC, null);
  assert.equal(point.humidityPct, null);
  assert.equal(point.weatherCode, null);
  assert.equal(point.windSpeedKmh, null);
  assert.equal(point.precipitationMm, null);
  assert.equal(point.dailyMaximumC, null);
  assert.equal(_normalizeLocation({ current: { temperature_2m: null } }, {
    latitude: 12.9716, longitude: 77.5946, row: 0, col: 0,
  }), null);
});
