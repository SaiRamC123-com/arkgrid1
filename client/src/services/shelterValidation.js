const FACILITY_TYPES = new Set(["shelter", "hospital", "relief"]);
const AVAILABILITY_STATES = new Set(["open", "limited", "full", "closed", "unknown"]);

export function isValidShelter(facility) {
  return Boolean(
    facility &&
    typeof facility.id === "string" &&
    facility.id.trim() &&
    typeof facility.name === "string" &&
    facility.name.trim() &&
    FACILITY_TYPES.has(facility.type) &&
    Number.isFinite(facility.lat) &&
    facility.lat >= -90 &&
    facility.lat <= 90 &&
    Number.isFinite(facility.lng) &&
    facility.lng >= -180 &&
    facility.lng <= 180 &&
    typeof facility.address === "string" &&
    Number.isInteger(facility.capacity) &&
    facility.capacity >= 0 &&
    Number.isInteger(facility.occupied) &&
    facility.occupied >= 0 &&
    (facility.capacity === 0 ? facility.occupied === 0 : facility.occupied <= facility.capacity) &&
    AVAILABILITY_STATES.has(facility.availability)
  );
}

export function parseShelterResponse(payload) {
  if (!payload || !Array.isArray(payload.shelters)) {
    throw new Error("Shelter API returned an invalid response: expected a shelters list.");
  }

  const invalidCount = payload.shelters.filter((facility) => !isValidShelter(facility)).length;
  if (invalidCount > 0) {
    throw new Error(`Shelter API returned ${invalidCount} invalid facility record(s); the response was rejected.`);
  }

  return payload;
}

export function preserveSavedOnEmptyResponse(facilities, saved) {
  return facilities.length === 0 && Array.isArray(saved?.list) && saved.list.length > 0 ? saved : null;
}

export function shelterRefreshError(error) {
  const status = error?.response?.status;
  const serverMessage = error?.response?.data?.message;
  if (status === 401) return "Shelter refresh failed (401): your sign-in is missing or expired. Sign in again, then retry.";
  if (status === 403) return "Shelter refresh failed (403): this account is not permitted to view shelter data.";
  if (status === 404) return "Shelter refresh failed (404): the configured API does not expose the shelter endpoint. Check the API URL and deployment.";
  if (status >= 500) return `Shelter refresh failed (${status}): ${serverMessage || "the API encountered a server error."}`;
  if (status) return `Shelter refresh failed (${status}): ${serverMessage || error.message || "the API rejected the request."}`;
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
    return "Shelter refresh timed out. Check your connection and retry.";
  }
  if (error?.code === "ERR_NETWORK" || error?.request) {
    return `Shelter API could not be reached. Check your connection and configured API URL${error?.message ? ` (${error.message})` : ""}.`;
  }
  return error?.message || "Shelter data could not be refreshed.";
}

export function shelterFailureNotice(error, saved) {
  const count = Array.isArray(saved?.list) ? saved.list.length : 0;
  return `${shelterRefreshError(error)}${count ? ` Showing ${count} saved facility record(s).` : " No saved facilities are available."}`;
}
