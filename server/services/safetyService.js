const { distanceM, pointToPolylineM } = require("../utils/geo");

const fresh = (t) => t.location && !t.stale && t.status !== "offline";

function cellOf(sc, p) {
  const b = sc.bounds;
  if (p.lat < b.south || p.lat > b.north || p.lng < b.west || p.lng > b.east) return -1;
  const i = Math.min(sc.grid - 1, Math.floor((p.lat - b.south) / sc.cell.dLat));
  const j = Math.min(sc.grid - 1, Math.floor((p.lng - b.west) / sc.cell.dLng));
  return i * sc.grid + j;
}

// Live responder hazard-proximity alerts
exports.alerts = ({ teams, powerlines, roads, scenario }) => {
  const out = [];
  teams.filter(fresh).forEach((t) => {
    const push = (key, level, message) =>
      out.push({ id: `sf-${t.id}-${key}`, level, kind: "safety", teamId: t.id, message, at: t.locationAt, focus: t.location });

    const near = powerlines.map((p) => ({ p, d: distanceM(t.location, p) })).sort((a, b) => a.d - b.d)[0];
    if (near && near.d <= 150) push("pl", "critical", `${t.name} is ${Math.round(near.d)} m from a reported downed powerline`);

    const road = roads.filter((r) => r.status !== "passable" && !r.stale)
      .map((r) => ({ r, d: pointToPolylineM(t.location, r.coords) })).sort((a, b) => a.d - b.d)[0];
    if (road && road.d <= 25) push("rd", "warning", `${t.name} is on or beside a ${road.r.status} road (${road.r.name})`);

    if (scenario) {
      const idx = cellOf(scenario, t.location);
      if (idx >= 0) {
        const st = scenario.status[idx];
        const tm = scenario.tMin[idx];
        if (st === 2) push("trap", "critical", `${t.name} is inside a flash-surge trap zone (floods in ~${Math.round(tm)} min, scenario)`);
        else if (st === 3) push("wet", "warning", `${t.name} is in ground already under water in the active scenario`);
        else if (st === 1 && tm >= 0 && tm <= 30) push("soon", "warning", `${t.name}'s area floods in ~${Math.round(tm)} min in the active scenario`);
      }
    }
  });
  return out;
};