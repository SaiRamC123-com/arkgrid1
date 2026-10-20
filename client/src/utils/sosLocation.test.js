import test from "node:test";
import assert from "node:assert/strict";
import { gpsFixFromPosition, isValidGpsFix, moreAccurateGpsFix } from "./sosLocation.js";

test("GPS readings must have in-range coordinates, valid accuracy, and a valid timestamp", () => {
  assert.equal(isValidGpsFix({ lat: 91, lng: 0, accuracy: 1, at: Date.now() }), false);
  assert.equal(isValidGpsFix({ lat: 10, lng: 181, accuracy: 1, at: Date.now() }), false);
  assert.equal(isValidGpsFix({ lat: 10, lng: 20, accuracy: -1, at: Date.now() }), false);
  assert.equal(isValidGpsFix({ lat: 10, lng: 20, accuracy: 1, at: "invalid" }), false);
});

test("GPS readings are normalized and the smallest-accuracy valid fix wins", () => {
  const lessAccurate = gpsFixFromPosition({
    coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 35 },
    timestamp: Date.now(),
  });
  const moreAccurate = gpsFixFromPosition({
    coords: { latitude: 12.9717, longitude: 77.5947, accuracy: 8 },
    timestamp: Date.now(),
  });
  assert.equal(moreAccurateGpsFix(lessAccurate, moreAccurate), moreAccurate);
  assert.equal(moreAccurateGpsFix(moreAccurate, lessAccurate), moreAccurate);
});
