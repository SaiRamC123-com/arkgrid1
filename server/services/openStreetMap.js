const axios = require("axios");
const { distanceM, validCoords } = require("../utils/geo");

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

function addressFrom(tags) {
  return [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:suburb"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"],
  ].filter(Boolean).join(", ");
}

function shapeFacility(element, origin, radiusM) {
  const tags = element.tags || {};
  const point = element.center || element;
  const lat = Number(point.lat);
  const lng = Number(point.lon ?? point.lng);
  if (!validCoords(lat, lng)) return null;

  const dist = distanceM(origin, { lat, lng });
  if (dist > radiusM) return null;

  const type = tags.amenity === "hospital" || tags.amenity === "clinic" ? "hospital" : "shelter";
  const category = type === "hospital" ? (tags.amenity || "healthcare facility") : "mapped shelter";
  const name = tags.name || (type === "hospital" ? "Unnamed healthcare facility" : "Unnamed mapped shelter");
  const phone = tags["contact:phone"] || tags.phone || "";

  return {
    id: `osm-${element.type}-${element.id}`,
    source: "openstreetmap",
    sourceName: "OpenStreetMap community map",
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    sourceCategory: category,
    type,
    name,
    address: addressFrom(tags),
    phone,
    lat,
    lng,
    capacity: 0,
    occupied: 0,
    occupancyPct: null,
    availability: "unknown",
    status: "unknown",
    resources: {},
    demo: false,
    updatedAt: null,
    updatedByName: "",
    dist,
  };
}

exports.nearbyFacilities = async (lat, lng, radiusM) => {
  const origin = { lat, lng };
  const key = `${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusM}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const query = [
    "[out:json][timeout:12];",
    "(",
    `nwr(around:${radiusM},${lat},${lng})[amenity=hospital];`,
    `nwr(around:${radiusM},${lat},${lng})[amenity=clinic];`,
    `nwr(around:${radiusM},${lat},${lng})[amenity=shelter];`,
    `nwr(around:${radiusM},${lat},${lng})[emergency=shelter];`,
    ");",
    "out center tags;",
  ].join("");
  const response = await axios.post(ENDPOINT, new URLSearchParams({ data: query }), {
    timeout: 18000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "ArkGrid/1.0 (nearby disaster-response facilities)",
    },
  });
  if (!Array.isArray(response.data?.elements)) {
    throw new Error("OpenStreetMap returned an unexpected nearby-facilities response");
  }

  const facilities = response.data.elements
    .map((element) => shapeFacility(element, origin, radiusM))
    .filter(Boolean)
    .slice(0, 100);
  cache.set(key, { at: Date.now(), data: facilities });
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return facilities;
};
