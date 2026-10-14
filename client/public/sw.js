const VERSION = "v1";
const SHELL = `ark-shell-${VERSION}`;
const TILES = `ark-tiles-${VERSION}`;
const ASSETS = `ark-assets-${VERSION}`;
const MAX_TILES = 1500;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/", "/index.html", "/icon.svg", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => ![SHELL, TILES, ASSETS].includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) {
      cache.put(req, res.clone());
      trim(name, max);
    }
    return res;
  } catch {
    return Response.error();
  }
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return; // never cache API calls

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put("/index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (url.hostname.endsWith("basemaps.cartocdn.com") || url.hostname.endsWith("tile.openstreetmap.org")) {
    e.respondWith(cacheFirst(req, TILES, MAX_TILES));
    return;
  }

  if (
    url.origin === self.location.origin ||
    ["fonts.googleapis.com", "fonts.gstatic.com", "unpkg.com"].includes(url.hostname)
  ) {
    e.respondWith(staleWhileRevalidate(req, ASSETS));
  }
});

// Background Sync: ask any open tab to flush the SOS queue
self.addEventListener("sync", (e) => {
  if (e.tag === "ark-sync") {
    e.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true, type: "window" })
        .then((clients) => clients.forEach((c) => c.postMessage({ type: "FLUSH_QUEUE" })))
    );
  }
});

self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});