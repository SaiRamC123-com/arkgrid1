import { openDB } from "idb";

let dbPromise;
const getDB = () =>
  (dbPromise ||= openDB("arkgrid-offline", 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("locationHistory")) {
        const history = db.createObjectStore("locationHistory", { keyPath: "id" });
        history.createIndex("byUidAt", ["uid", "at"]);
      }
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
  if (!uid) return [];
  const all = await (await getDB()).getAll("queue");
  return all.filter((i) => i.uid === uid).sort((a, b) => a.createdAt - b.createdAt);
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

export const saveLocationSnapshot = async (snapshot) => {
  await (await getDB()).put("locationHistory", snapshot);
};

export const getLocationHistory = async (uid, since = Date.now() - 15 * 60 * 1000) => {
  if (!uid) return [];
  const db = await getDB();
  const history = await db.getAllFromIndex(
    "locationHistory",
    "byUidAt",
    IDBKeyRange.bound([uid, since], [uid, Date.now()])
  );
  return history.sort((a, b) => b.at - a.at);
};

export const pruneLocationHistory = async (uid, before = Date.now() - 30 * 60 * 1000) => {
  if (!uid) return;
  const db = await getDB();
  const tx = db.transaction("locationHistory", "readwrite");
  const store = tx.store;
  const records = await store.index("byUidAt").getAll(IDBKeyRange.bound([uid, 0], [uid, before]));
  await Promise.all(records.map((record) => store.delete(record.id)));
  const retained = await store.index("byUidAt").getAll(IDBKeyRange.bound([uid, before], [uid, Date.now()]));
  if (retained.length > 2000) {
    await Promise.all(retained
      .sort((a, b) => a.at - b.at)
      .slice(0, retained.length - 2000)
      .map((record) => store.delete(record.id)));
  }
  await tx.done;
};