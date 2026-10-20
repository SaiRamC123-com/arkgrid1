const httpError = (status, message) => Object.assign(new Error(message), { status });
const FALLBACK_NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ERR_NETWORK",
]);

function isFallbackEligible(err) {
  if (!err?.isAxiosError) return false;

  const status = err.response?.status;
  if (Number.isInteger(status)) return status === 408 || status >= 500;

  return FALLBACK_NETWORK_CODES.has(err.code);
}

function mlError(err, what = "model") {
  if (!err.isAxiosError) return err;
  if (!err.response) return httpError(503, `The ${what} service is offline. Start the ML service and try again.`);
  if (err.response.status === 401) return httpError(502, "The ML service rejected the server key. Check ML_API_KEY.");
  const d = err.response.data?.detail;
  return httpError(502, typeof d === "string" ? d : `The ${what} could not run. Try again.`);
}

mlError.isFallbackEligible = isFallbackEligible;

module.exports = mlError;