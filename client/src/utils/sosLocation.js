export function isValidGpsFix(fix, now = Date.now()) {
  const at = typeof fix?.at === "number" ? fix.at : Date.parse(fix?.at);
  return Number.isFinite(fix?.lat) && fix.lat >= -90 && fix.lat <= 90
    && Number.isFinite(fix?.lng) && fix.lng >= -180 && fix.lng <= 180
    && Number.isFinite(fix?.accuracy) && fix.accuracy >= 0
    && Number.isFinite(at) && at > 0 && at <= now + 60000;
}

export function gpsFixFromPosition(position) {
  if (!position?.coords) return null;
  const { latitude: lat, longitude: lng, accuracy } = position.coords;
  const fix = {
    lat,
    lng,
    accuracy,
    at: Number.isFinite(position.timestamp) && position.timestamp > 0 ? position.timestamp : Date.now(),
    source: "fresh_device",
  };
  return isValidGpsFix(fix) ? fix : null;
}

export function moreAccurateGpsFix(current, candidate) {
  if (!isValidGpsFix(candidate)) return current;
  return !isValidGpsFix(current) || candidate.accuracy < current.accuracy ? candidate : current;
}
