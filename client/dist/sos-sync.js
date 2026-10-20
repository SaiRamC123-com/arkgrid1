self.addEventListener("sync", (event) => {
  if (event.tag !== "ark-sync") return;
  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then((clients) => clients.forEach((client) => client.postMessage({ type: "FLUSH_QUEUE" })))
  );
});
