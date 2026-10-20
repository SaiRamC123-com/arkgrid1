import { isValidGpsFix } from "./sosLocation.js";

export const LOCATION_HISTORY_MINUTES = 15;
export const LOCATION_HISTORY_RETENTION_MINUTES = 30;
export const HISTORICAL_LOCATION_TOLERANCE_MS = 2 * 60 * 1000;

export function isValidLocationSnapshot(snapshot, now = Date.now()) {
  return typeof snapshot?.id === "string"
    && snapshot.id.length > 0
    && typeof snapshot?.uid === "string"
    && snapshot.uid.length > 0
    && snapshot.source === "fresh_device"
    && isValidGpsFix(snapshot, now);
}

export function selectLocationSnapshot(snapshots, targetAgeMinutes = "latest", now = Date.now()) {
  const valid = (Array.isArray(snapshots) ? snapshots : [])
    .filter((snapshot) => isValidLocationSnapshot(snapshot, now))
    .map((snapshot) => ({
      ...snapshot,
      ageMs: now - (typeof snapshot.at === "number" ? snapshot.at : Date.parse(snapshot.at)),
    }))
    .filter((snapshot) => snapshot.ageMs >= 0)
    .sort((a, b) => b.at - a.at);

  if (targetAgeMinutes === "latest") return valid[0] || null;
  if (![5, 10].includes(targetAgeMinutes)) return null;

  const targetAgeMs = targetAgeMinutes * 60 * 1000;
  return valid
    .filter((snapshot) => Math.abs(snapshot.ageMs - targetAgeMs) <= HISTORICAL_LOCATION_TOLERANCE_MS)
    .sort((a, b) => Math.abs(a.ageMs - targetAgeMs) - Math.abs(b.ageMs - targetAgeMs))[0] || null;
}
