export function registerSW() {
  // Production only, so dev hot-reload is never fighting a cache
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.error("SW failed", e));
  });
}