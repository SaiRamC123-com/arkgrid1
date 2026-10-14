const TILE_CACHE = "ark-tiles-v1"; // same cache the service worker serves from

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function range(b, z) {
  const max = 2 ** z - 1;
  const clamp = (n) => Math.min(max, Math.max(0, n));
  return {
    x0: clamp(lon2x(b.west, z)), x1: clamp(lon2x(b.east, z)),
    y0: clamp(lat2y(b.north, z)), y1: clamp(lat2y(b.south, z)),
  };
}
const count = (b, z) => {
  const r = range(b, z);
  return (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
};

// Builds the exact URLs Leaflet will request, so cached tiles are hit offline
export function tileUrls(bounds, { minZ = 11, maxZ = 15, cap = 300 } = {}) {
  const retina = window.devicePixelRatio > 1 ? "@2x" : "";
  const total = (top) => {
    let n = 0;
    for (let z = minZ; z <= top; z++) n += count(bounds, z);
    return n;
  };
  let top = maxZ;
  while (top > minZ && total(top) > cap) top--;

  const urls = [];
  for (let z = minZ; z <= top; z++) {
    const { x0, x1, y0, y1 } = range(bounds, z);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const s = "abc"[Math.abs(x + y) % 3];
        urls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
  }
  return urls.slice(0, cap);
}

export async function prefetchTiles(urls, onProgress) {
  if (!("caches" in window)) throw new Error("Offline storage is not available here");
  const cache = await caches.open(TILE_CACHE);
  const queue = [...urls];
  let done = 0;
  let ok = 0;

  const worker = async () => {
    while (queue.length) {
      const url = queue.pop();
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res);
          else throw new Error("tile");
        }
        ok++;
      } catch {
        /* skip failed tile */
      }
      done++;
      onProgress?.(done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { ok, total: urls.length };
}

export function boundsFromPoints(points, minPad = 0.008) {
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const south = Math.min(...lats), north = Math.max(...lats);
  const west = Math.min(...lngs), east = Math.max(...lngs);
  const pad = Math.max(minPad, Math.max(north - south, east - west) * 0.1);
  return { south: south - pad, north: north + pad, west: west - pad, east: east + pad };
}