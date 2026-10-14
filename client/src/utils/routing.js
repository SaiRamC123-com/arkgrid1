import { distanceM } from "./geo";

const ENDPOINTS = {
  driving: "https://router.project-osrm.org/route/v1/driving",
  walking: "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
};

export async function fetchRoute(from, to, mode = "driving") {
  const url = `${ENDPOINTS[mode]}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error("Routing service error");
    const data = await res.json();
    const r = data.routes?.[0];
    if (data.code !== "Ok" || !r) throw new Error("No route found");
    return {
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceM: r.distance,
      durationS: r.duration,
      mode,
      approx: false,
      savedAt: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Fallback when the routing service is unreachable
export function straightRoute(from, to, mode = "driving") {
  const d = distanceM(from, to);
  const speed = mode === "walking" ? 1.25 : 11; // m/s
  return {
    coords: [[from.lat, from.lng], [to.lat, to.lng]],
    distanceM: d,
    durationS: d / speed,
    mode,
    approx: true,
    savedAt: Date.now(),
  };
}

export const fmtDuration = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
export async function fetchRouteAlternatives(from, to) {
  const url = `${ENDPOINTS.driving}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=3`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error("Routing service error");
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("No route found");
    return data.routes.map((r) => ({
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceM: r.distance, durationS: r.duration, approx: false,
    }));
  } finally {
    clearTimeout(timer);
  }
}