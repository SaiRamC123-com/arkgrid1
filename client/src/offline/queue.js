import { openDB } from "idb";

let dbPromise;
const getDB = () =>
  (dbPromise ||= openDB("arkgrid-offline", 1, {
    upgrade(db) {
      db.createObjectStore("queue", { keyPath: "id" });
      db.createObjectStore("meta");
    },
  }));

const bus = new EventTarget();
const emit = () => bus.dispatchEvent(new Event("change"));

export const onQueueChange = (fn) => {
  bus.addEventListener("change", fn);
  return () => bus.removeEventListener("change", fn);
};

export const enqueue = async (item) => {
  await (await getDB()).put("queue", item);
  emit();
};

// uid filter: a queued SOS must never be sent by a different account
export const getQueue = async (uid) => {
  const all = await (await getDB()).getAll("queue");
  return all.filter((i) => !uid || i.uid === uid).sort((a, b) => a.createdAt - b.createdAt);
};

export const removeFromQueue = async (id) => {
  await (await getDB()).delete("queue", id);
  emit();
};

export const updateQueueItem = async (id, patch) => {
  const db = await getDB();
  const cur = await db.get("queue", id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  await db.put("queue", next);
  emit();
  return next;
};

export const setMeta = async (key, value) => (await getDB()).put("meta", value, key);
export const getMeta = async (key) => (await getDB()).get("meta", key);