import { useCallback, useEffect, useRef, useState } from "react";

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};

// Keeps the freshest GPS fix in memory AND localStorage (persistent last-known location)
export default function useLastFix(uid) {
  const key = `ark_last_fix_${uid}`;
  const [fix, setFix] = useState(() => read(key));
  const [error, setError] = useState(null);
  const ref = useRef(fix);
  ref.current = fix;

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Location is not supported on this device");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const f = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), at: Date.now() };
        localStorage.setItem(key, JSON.stringify(f));
        setFix(f);
        setError(null);
      },
      (e) => setError(e.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [key]);

  // Instant when a fix is fresh (<2 min); otherwise try once (6s) then fall back to last known
  const resolveFix = useCallback(
    () =>
      new Promise((resolve) => {
        const cur = ref.current;
        if (cur && Date.now() - cur.at < 120000) return resolve(cur);
        if (!("geolocation" in navigator)) return resolve(cur || null);
        navigator.geolocation.getCurrentPosition(
          (p) =>
            resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), at: Date.now() }),
          () => resolve(cur || null),
          { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
        );
      }),
    []
  );

  return { fix, error, resolveFix };
}