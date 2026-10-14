const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

/* ---------- Step 2: distance and formatting ---------- */

export const distanceM = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const fmtDistance = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export const timeAgo = (iso) => {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86400)} d ago`;
};

/* ---------- Step 5: route vs flooded/blocked roads ---------- */

// Does a route pass within `thr` meters of any flooded/blocked road segment?
// routeCoords: [[lat,lng],...]   roads: [{coords:[{lat,lng}], status, stale, name}]
export function routeHazards(routeCoords, roads, thr = 40) {
  if (!routeCoords || routeCoords.length < 2) return [];
  const [lat0, lng0] = routeCoords[0];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const P = (lat, lng) => [(lng - lng0) * kx, (lat - lat0) * ky];

  const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const cross = (a, b, c, d) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
  const ptSeg = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const segDist = (a, b, c, d) =>
    cross(a, b, c, d) ? 0 : Math.min(ptSeg(c, a, b), ptSeg(d, a, b), ptSeg(a, c, d), ptSeg(b, c, d));

  const route = routeCoords.map(([la, ln]) => P(la, ln));
  const lats = routeCoords.map((c) => c[0]);
  const lngs = routeCoords.map((c) => c[1]);
  const box = {
    s: Math.min(...lats) - 0.001,
    n: Math.max(...lats) + 0.001,
    w: Math.min(...lngs) - 0.001,
    e: Math.max(...lngs) + 0.001,
  };

  return roads.filter((r) => {
    if (r.status === "passable" || r.stale || !r.coords?.length) return false;
    if (r.coords.every((p) => p.lat < box.s || p.lat > box.n || p.lng < box.w || p.lng > box.e)) return false;
    const rp = r.coords.map((p) => P(p.lat, p.lng));
    for (let i = 1; i < route.length; i++)
      for (let j = 1; j < rp.length; j++)
        if (segDist(route[i - 1], route[i], rp[j - 1], rp[j]) <= thr) return true;
    return false;
  });
}