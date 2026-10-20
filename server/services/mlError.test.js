const test = require("node:test");
const assert = require("node:assert/strict");
const mlError = require("../utils/mlError");

test("ML clustering fallback is limited to network and service availability failures", () => {
  assert.equal(mlError.isFallbackEligible({ isAxiosError: true, code: "ECONNREFUSED" }), true);
  assert.equal(mlError.isFallbackEligible({ isAxiosError: true, code: "ETIMEDOUT" }), true);
  assert.equal(mlError.isFallbackEligible({ isAxiosError: true, response: { status: 408 } }), true);
  assert.equal(mlError.isFallbackEligible({ isAxiosError: true, response: { status: 503 } }), true);

  assert.equal(mlError.isFallbackEligible({ isAxiosError: true, response: { status: 401 } }), false);
  assert.equal(mlError.isFallbackEligible({ isAxiosError: true, response: { status: 422 } }), false);
  assert.equal(mlError.isFallbackEligible({ isAxiosError: true, code: "ERR_BAD_OPTION" }), false);
  assert.equal(mlError.isFallbackEligible(new Error("ML reply failed validation")), false);
});
