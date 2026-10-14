import { useCallback, useEffect, useRef, useState } from "react";
import { shelterApi } from "../services/shelterService";
import { getMeta, setMeta } from "../offline/queue";

export default function useShelters() {
  const [shelters, setShelters] = useState(null);
  const [offline, setOffline] = useState(false);
  const [staleAt, setStaleAt] = useState(null);
  const lastOk = useRef(null);

  const load = useCallback(async () => {
    try {
      const list = await shelterApi.list();
      lastOk.current = Date.now();
      setShelters(list);
      setOffline(false);
      setStaleAt(null);
      setMeta("shelters", { list, at: lastOk.current }); // saved for offline use
    } catch {
      const cached = await getMeta("shelters");
      setShelters((prev) => prev ?? cached?.list ?? []);
      setOffline(true);
      setStaleAt(lastOk.current || cached?.at || null);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [load]);

  const patchLocal = useCallback(
    (s) => setShelters((prev) => (prev ? prev.map((x) => (x.id === s.id ? s : x)) : prev)),
    []
  );

  return { shelters, offline, staleAt, reload: load, patchLocal };
}