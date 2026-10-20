const { validCoords } = require("./geo");

const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = (value, max) => String(value ?? "").trim().slice(0, max);

function parseSosLocation(body) {
  const hasLat = body.lat !== undefined && body.lat !== null && body.lat !== "";
  const hasLng = body.lng !== undefined && body.lng !== null && body.lng !== "";
  if (!hasLat && !hasLng) return null;
  if (hasLat !== hasLng) throw httpError(400, "lat and lng must be provided together");
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!validCoords(lat, lng)) throw httpError(400, "Invalid coordinates");
  const hasAccuracy = body.accuracy !== undefined && body.accuracy !== null && Number.isFinite(Number(body.accuracy));
  const source = ["fresh_device", "last_known", "last_recorded", "manual"].includes(body.locationSource)
    ? body.locationSource
    : "unknown";
  return {
    lat,
    lng,
    accuracy: hasAccuracy ? Math.max(0, Math.round(Number(body.accuracy))) : null,
    source,
  };
}

function parseSosDetails(body) {
  const fields = ["landmark", "locality", "trappedDescription", "locationDetailsConfirmed"];
  if (!fields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) return null;
  const clean = (value, max) => str(value, max).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return {
    landmark: clean(body.landmark, 80),
    locality: clean(body.locality, 100),
    trappedDescription: clean(body.trappedDescription, 140),
    locationDetailsConfirmed: body.locationDetailsConfirmed === true,
  };
}

module.exports = { parseSosDetails, parseSosLocation };
