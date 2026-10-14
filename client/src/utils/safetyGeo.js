import { distanceM } from "./geo";

export const cellAt = (sc, p) => {
  const b = sc.bounds;
  if (p.lat < b.south || p.lat > b.north || p.lng < b.west || p.lng > b.east) return null;
  const i = Math.min(sc.grid - 1, Math.floor((p.lat - b.south) / sc.cell.dLat));
  const j = Math.min(sc.grid - 1, Math.floor((p.lng - b.west) / sc.cell.dLng));
  return i * sc.grid + j;
};

// Insert points so no segment is longer than `stepM`. coords: [[lat,lng],...]
export function densify(coords, stepM = 60) {
  const out = [];
  for (let i = 0; i < coords.length; i++) {
    out.push(coords[i]);
    if (i === coords.length - 1) break;
    const [a, b] = [coords[i], coords[i + 1]];
    const d = distanceM({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
    const k = Math.floor(d / stepM);
    for (let s = 1; s <= k; s++) out.push([a[0] + ((b[0] - a[0]) * s) / (k + 1), a[1] + ((b[1] - a[1]) * s) / (k + 1)]);
  }
  return out;
}

// What does the scenario say about the cells a route passes through?
export function routeScenarioStats(coords, sim) {
  let minT = Infinity, traps = 0, wet = 0;
  const seen = new Set();
  densify(coords).forEach(([lat, lng]) => {
    const idx = cellAt(sim, { lat, lng });
    if (idx === null || seen.has(idx)) return;
    seen.add(idx);
    const c = sim.cells[idx];
    if (c.status === 2) traps++;
    if (c.status === 3) wet++;
    if (c.t != null) minT = Math.min(minT, c.t);
  });
  return { minT: Number.isFinite(minT) ? minT : null, traps, wet, checked: seen.size };
}

export function nearPoints(coords, points, thrM) {
  const dense = densify(coords, 40);
  return points.filter((p) => dense.some(([lat, lng]) => distanceM({ lat, lng }, p) <= thrM));
}

const RANK = { go: 0, caution: 1, nogo: 2 };
export const verdictRank = (v) => RANK[v.level];

// Go / caution / no-go for a ground mission (thresholds are assumptions)
export function verdict({ travelMin, onSceneMin, stats, hazards, powerlines, targetCell }) {
  const need = travelMin * 2 + onSceneMin; // in + on scene + out
  const reasons = [];
  let level = "go";
  const bump = (l) => { if (RANK[l] > RANK[level]) level = l; };

  if (stats && (stats.traps || stats.wet)) { bump("nogo"); reasons.push(`Route crosses ${stats.traps + stats.wet} cell(s) that are already under water or would flood before you could walk out.`); }
  if (targetCell === 2 || targetCell === 3) { bump("nogo"); reasons.push("The target itself is inside a flash-surge trap or already-flooded zone."); }
  if (stats?.minT != null) {
    if (stats.minT < need) { bump("nogo"); reasons.push(`Part of the route floods in about ${Math.round(stats.minT)} min, but the mission needs about ${Math.round(need)} min (in, on scene, out).`); }
    else if (stats.minT < need * 1.5) { bump("caution"); reasons.push(`Thin margin: the route floods in about ${Math.round(stats.minT)} min against ${Math.round(need)} min needed.`); }
  }
  if (hazards.some((h) => h.status === "blocked")) { bump("nogo"); reasons.push("Route passes a road reported as blocked."); }
  else if (hazards.length) { bump("caution"); reasons.push(`Route passes near ${hazards.length} flooded road report(s).`); }
  if (powerlines.length) { bump("caution"); reasons.push(`Within 100 m of ${powerlines.length} reported downed powerline(s). Keep clear and treat all lines as live.`); }
  if (!reasons.length) reasons.push("No hazards found in the reported data. This does not mean the route is safe.");
  return { level, reasons, need };
}