const ml = require("./mlClient");

const TTL = 10 * 60 * 1000; // rainfall refreshes hourly, so 10 min is plenty
const cache = new Map();
const r3 = (v) => Number(v.toFixed(3));

exports.getRisk = async (p) => {
  const key = [r3(p.lat), r3(p.lng), p.radiusM, p.grid, p.rain?.h24 ?? "", p.rain?.h1 ?? "", p.soil].join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { ...hit.data, cached: true };

  const data = await ml.floodRisk({
    lat: p.lat, lng: p.lng, radius_m: p.radiusM, grid: p.grid,
    rain_24h_mm: p.rain?.h24 ?? null, rain_1h_mm: p.rain?.h1 ?? null, soil_perm: p.soil,
  });
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return data;
};

// Cache-only lookup (never triggers a model run). Used by ArkBot.
exports.peekRiskAt = (loc) => {
  for (const { at, data } of cache.values()) {
    if (Date.now() - at > TTL || data.sources.rain === "manual scenario") continue;
    const b = data.bounds;
    if (loc.lat < b.south || loc.lat > b.north || loc.lng < b.west || loc.lng > b.east) continue;
    const i = Math.min(data.grid - 1, Math.floor((loc.lat - b.south) / data.cell.dLat));
    const j = Math.min(data.grid - 1, Math.floor((loc.lng - b.west) / data.cell.dLng));
    const c = data.cells[i * data.grid + j];
    if (c) return { tier: c.tier, score: c.score };
  }
  return null;
};