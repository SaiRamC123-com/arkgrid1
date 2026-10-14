import api from "../services/api";
import { getQueue, removeFromQueue, updateQueueItem } from "./queue";

const bus = new EventTarget();
const listen = (name) => (fn) => {
  const h = (e) => fn(e.detail);
  bus.addEventListener(name, h);
  return () => bus.removeEventListener(name, h);
};
export const onSynced = listen("synced");
export const onDropped = listen("dropped");

let running = false;
let rerun = false;

export async function flushQueue(uid) {
  if (!uid || !navigator.onLine) return { sent: 0, dropped: 0 };
  if (running) {
    rerun = true; // something was enqueued mid-flush: loop again
    return { sent: 0, dropped: 0 };
  }

  running = true;
  let sent = 0;
  let dropped = 0;
  let stop = false;

  try {
    do {
      rerun = false;
      const items = await getQueue(uid);
      for (const item of items) {
        try {
          if (item.type === "sos") await api.post("/api/sos", item.payload);
          await removeFromQueue(item.id);
          sent++;
          bus.dispatchEvent(new CustomEvent("synced", { detail: { item } }));
        } catch (err) {
          const status = err?.response?.status;
          const permanent = status >= 400 && status < 500 && ![401, 408, 429].includes(status);
          if (permanent) {
            await removeFromQueue(item.id);
            dropped++;
            bus.dispatchEvent(
              new CustomEvent("dropped", { detail: { item, message: err.response?.data?.message } })
            );
            continue;
          }
          // network / server / auth problem: keep it, retry later, preserve order
          await updateQueueItem(item.id, { attempts: (item.attempts || 0) + 1 });
          stop = true;
          break;
        }
      }
    } while (rerun && !stop);
  } finally {
    running = false;
  }
  return { sent, dropped };
}

export async function requestBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    await reg?.sync?.register("ark-sync");
  } catch {
    /* unsupported browsers fall back to online event + interval */
  }
}