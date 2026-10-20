export function classifySosSubmissionError(error) {
  const rawStatus = error?.response?.status ?? error?.status ?? null;
  const status = rawStatus === null || rawStatus === undefined ? null : Number(rawStatus);
  const code = String(error?.code || "").toUpperCase();

  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 408 || code === "ECONNABORTED" || code === "ETIMEDOUT") return "timeout";
  if (status === 429) return "rate_limited";
  if (status === 404) return "endpoint";
  if (status >= 500) return "server";
  if (status >= 400) return "validation";
  if (code === "ERR_CANCELED") return "cancelled";
  if (!error?.response || code === "ERR_NETWORK" || code === "ECONNRESET" || code === "ENOTFOUND") return "network";
  return "server";
}

export function sosSubmissionStatus(failure) {
  if (failure.kind === "authentication") {
    return "The response system requires a valid sign-in. The SOS remains saved on this device; sign in again before syncing.";
  }
  if (failure.kind === "authorization") {
    return "This account is not authorized to submit an SOS. The response system rejected the request; check the signed-in account or account role.";
  }
  if (failure.kind === "validation") {
    return `The response system rejected this SOS${failure.message ? `: ${failure.message}` : "."}`;
  }
  if (failure.kind === "rate_limited") {
    return "The response system is rate-limiting requests. The SOS remains saved on this device and will be retried.";
  }
  if (failure.kind === "endpoint") {
    return "The configured ArkGrid API does not provide the SOS endpoint. Check the API deployment; this is not a network connection failure.";
  }
  if (failure.kind === "timeout") {
    return "The SOS request timed out without acknowledgement. It remains saved for retry; the server may have received it.";
  }
  if (failure.kind === "server") {
    return `The response system returned an error${failure.status ? ` (${failure.status})` : ""}. The SOS remains saved for retry.`;
  }
  if (failure.kind === "cancelled") return "The SOS request was cancelled before acknowledgement.";
  return "The ArkGrid API could not be reached. The SOS remains saved on this device for retry.";
}
