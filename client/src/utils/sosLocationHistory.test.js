import test from "node:test";
import assert from "node:assert/strict";
import { HISTORICAL_LOCATION_TOLERANCE_MS, selectLocationSnapshot } from "./sosLocationHistory.js";

const now = Date.parse("2026-10-17T12:00:00.000Z");
const snapshot = (id, ageMs, extra = {}) => ({
  id,
  uid: "user-1",
  lat: 12.9716,
  lng: 77.5946,
  accuracy: 14,
  at: now - ageMs,
  source: "fresh_device",
  ...extra,
});

test("the default location is the most recent valid GPS snapshot", () => {
  const chosen = selectLocationSnapshot([
    snapshot("older", 5 * 60_000),
    snapshot("newest", 30_000),
    snapshot("manual", 1_000, { source: "manual" }),
  ], "latest", now);
  assert.equal(chosen.id, "newest");
});

test("five- and ten-minute choices select the closest real snapshot within a two-minute tolerance", () => {
  const snapshots = [
    snapshot("five-near", 4 * 60_000 + 30_000),
    snapshot("five-far", 7 * 60_000),
    snapshot("ten-near", 10 * 60_000 + 15_000),
    snapshot("too-old", 13 * 60_000),
  ];
  assert.equal(selectLocationSnapshot(snapshots, 5, now).id, "five-near");
  assert.equal(selectLocationSnapshot(snapshots, 10, now).id, "ten-near");
  assert.equal(HISTORICAL_LOCATION_TOLERANCE_MS, 2 * 60_000);
});

test("no snapshot outside the target tolerance is substituted", () => {
  assert.equal(selectLocationSnapshot([snapshot("too-recent", 2 * 60_000)], 5, now), null);
  assert.equal(selectLocationSnapshot([snapshot("future", -1_000)], "latest", now), null);
  assert.equal(selectLocationSnapshot([snapshot("bad-coordinates", 1_000, { lat: 91 })], "latest", now), null);
});
