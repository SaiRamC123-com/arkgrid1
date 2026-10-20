import test from "node:test";
import assert from "node:assert/strict";
import { HEAT_INDEX_BANDS_C, heatIndexC } from "./heatIndex.js";

test("NOAA/NWS heat index uses air temperature and humidity with published caution bands", () => {
  assert.equal(heatIndexC(25, 50), 25);
  assert.ok(Math.abs(heatIndexC(32.222222, 70) - 41.0) < 0.5);
  assert.equal(HEAT_INDEX_BANDS_C.caution, 26.666666666666668);
  assert.equal(HEAT_INDEX_BANDS_C.danger, 39.44444444444444);
});

test("invalid or incomplete humidity does not fabricate a heat index", () => {
  assert.equal(heatIndexC(34, null), null);
  assert.equal(heatIndexC(34, 101), null);
});
