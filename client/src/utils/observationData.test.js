import test from "node:test";
import assert from "node:assert/strict";
import { describeWeatherCode, distanceKm, isObservationInWindow, makeWeatherObservations } from "./observationData.js";

test("Open-Meteo weather codes are described as conditions, not confirmed disasters", () => {
  assert.equal(describeWeatherCode(65), "Heavy rain");
  assert.equal(describeWeatherCode(95), "Thunderstorm");
  assert.equal(describeWeatherCode(123), "Weather condition not reported");
  const [observation] = makeWeatherObservations([{
    row: 0,
    col: 0,
    latitude: 12.97,
    longitude: 77.59,
    weatherCode: 65,
    precipitationMm: 7,
    temperatureC: 32,
    modelTime: "2026-10-17T12:00",
  }]);
  assert.equal(observation.hazardType, "weather");
  assert.match(observation.status, /model output; not a disaster alert/);
  assert.equal(observation.severity, null);
});

test("weather observations omit malformed coordinates and distance filtering uses spherical distance", () => {
  assert.deepEqual(makeWeatherObservations([{ latitude: 91, longitude: 0, temperatureC: 20 }]), []);
  assert.ok(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) > 110);
  assert.ok(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) < 112);
});

test("combined time windows exclude older ended events but retain ongoing GDACS alerts", () => {
  const windowEnd = Date.parse("2026-10-17T12:00:00.000Z");
  assert.equal(isObservationInWindow({ time: "2026-10-17T11:30:00.000Z" }, 24, windowEnd), true);
  assert.equal(isObservationInWindow({ time: "2026-10-16T11:30:00.000Z" }, 24, windowEnd), false);
  assert.equal(isObservationInWindow({
    time: "2026-10-10T11:30:00.000Z",
    status: "Ongoing (GDACS)",
  }, 24, windowEnd), true);
  assert.equal(isObservationInWindow({ time: "invalid" }, 24, windowEnd), false);
});
