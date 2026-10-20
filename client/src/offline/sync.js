import api from "../services/api";
import { classifySosSubmissionError } from "../utils/sosSubmission";
import { getQueue, removeFromQueue, updateQueueItem } from "./queue";

const bus = new EventTarget();
const listen = (name) => (fn) => {
  const h = (e) => fn(e.detail);
  bus.addEventListener(name, h);
  return () => bus.removeEventListener(name, h);
};
export const onSynced = listen("synced");
export const onDropped = listen("dropped");
export const onFailed = listen("failed");

let running = false;
let rerun = false;

async function send(item) {
  if (item.type === "sos") return api.post("/api/sos", item.payload, { timeout: 15000 });
  if (item.type === "report") {
    const fd = new FormData();
    Object.entries(item.payload).forEach(([k, v]) => v != null && fd.append(k, v));
    if (item.photo) fd.append("photo", item.photo, "report.jpg");
    return api.post("/api/reports", fd, { timeout: 60000 });
  }
}

export async function flushQueue(uid) {
  if (!uid || !navigator.onLine) return { sent: 0, dropped: 0, synced: [], failures: [] };
  if (running) {
    rerun = true;
    return { sent: 0, dropped: 0, synced: [], failures: [], inProgress: true };
  }

  running = true;
  let sent = 0;
  let dropped = 0;
  const synced = [];
  const failures = [];
  let stop = false;

  try {
    do {
      rerun = false;
      // SOS always first, then the rest in the order they were saved
      const items = (await getQueue(uid)).sort(
        (a, b) => (b.type === "sos") - (a.type === "sos") || a.createdAt - b.createdAt
      );
      for (const item of items) {
        try {
          await send(item);
          await removeFromQueue(item.id);
          sent++;
          synced.push({ id: item.id, type: item.type });
          bus.dispatchEvent(new CustomEvent("synced", { detail: { item } }));
        } catch (err) {
          const status = err?.response?.status;
          if (item.type === "sos") {
            const failure = {
              id: item.id,
              type: item.type,
              kind: classifySosSubmissionError(err),
              status: status || null,
              message: err?.response?.data?.message || "",
            };
            failures.push(failure);
            bus.dispatchEvent(new CustomEvent("failed", { detail: { item, failure } }));
          }
          const permanent = status >= 400 && status < 500 && ![401, 408, 429].includes(status);
          if (permanent) {
            await removeFromQueue(item.id);
            dropped++;
            bus.dispatchEvent(new CustomEvent("dropped", { detail: { item, message: err.response?.data?.message } }));
            continue;
          }
          await updateQueueItem(item.id, { attempts: (item.attempts || 0) + 1 });
          if (!err?.response) {
            stop = true; // no network: stop and retry later
            break;
          }
          // a server error on one item must not block the others
        }
      }
    } while (rerun && !stop);
  } finally {
    running = false;
  }
  return { sent, dropped, synced, failures };
}

export async function requestBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    await reg?.sync?.register("ark-sync");
  } catch {
    /* unsupported browsers fall back to the online event + interval */
  }
}