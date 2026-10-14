import { useEffect, useRef, useState } from "react";

export default function useLiveLocation(enabled, onFix, intervalMs = 30000) {
  const [pos, setPos] = useState(null);
  const [error, setError] = useState(null);
  const lastSent = useRef(0);
  const cb = useRef(onFix);
  cb.current = onFix;

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      setError("Location is not supported on this device");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Math.round(p.coords.accuracy),
        };
        setPos(fix);
        setError(null);
        const now = Date.now();
        if (now - lastSent.current >= intervalMs) {
          lastSent.current = now;
          cb.current(fix);
        }
      },
      (e) => setError(e.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, intervalMs]);

  return { pos, error };
}