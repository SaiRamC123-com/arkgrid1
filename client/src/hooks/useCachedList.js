import { useCallback, useEffect, useRef, useState } from "react";
import { getMeta, setMeta } from "../offline/queue";

export default function useCachedList(key, fetcher, intervalMs = 20000) {
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);
  const [staleAt, setStaleAt] = useState(null);
  const lastOk = useRef(null);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const load = useCallback(async () => {
    try {
      const list = await fetchRef.current();
      lastOk.current = Date.now();
      setData(list);
      setOffline(false);
      setError(null);
      setStaleAt(null);
      setMeta(key, { list, at: lastOk.current });
    } catch (err) {
      const c = await getMeta(key);
      setData((p) => p ?? c?.list ?? []);
      setOffline(!err?.response); // offline only if the server could not be reached at all
      setError(err?.response ? err.response.data?.message || `Server error ${err.response.status}` : null);
      setStaleAt(lastOk.current || c?.at || null);
    }
  }, [key]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs]);

  const patch = useCallback((item) => setData((p) => (p ? p.map((x) => (x.id === item.id ? item : x)) : p)), []);
  return { data, offline, error, staleAt, reload: load, patch };
}