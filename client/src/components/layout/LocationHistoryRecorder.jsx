import { useEffect, useRef } from "react";
import { saveLocationSnapshot, pruneLocationHistory } from "../../offline/queue";
import { gpsFixFromPosition } from "../../utils/sosLocation";
import { newId } from "../../utils/id";

export default function LocationHistoryRecorder({ uid }) {
  const lastSavedTimestamp = useRef(null);

  useEffect(() => {
    if (!uid || !navigator.geolocation || !navigator.permissions?.query) return undefined;

    let watchId = null;
    let refreshTimer = null;
    let disposed = false;
    let permission;
    let permissionChange;
    const record = async (position) => {
      const fix = gpsFixFromPosition(position);
      if (!fix || fix.at === lastSavedTimestamp.current) return;
      lastSavedTimestamp.current = fix.at;
      try {
        await saveLocationSnapshot({ ...fix, id: newId(), uid, at: fix.at });
        await pruneLocationHistory(uid);
      } catch (error) {
        console.error("Could not persist a device location snapshot:", error);
      }
    };
    const sample = () => {
      navigator.geolocation.getCurrentPosition(
        record,
        (error) => {
          if (error.code !== error.PERMISSION_DENIED) {
            console.warn("Could not sample device location history:", error.message);
          }
        },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
      );
    };
    const start = () => {
      if (disposed || watchId !== null || permission?.state !== "granted") return;
      watchId = navigator.geolocation.watchPosition(
        record,
        (error) => {
          if (error.code !== error.PERMISSION_DENIED) {
            console.warn("Could not record device location history:", error.message);
          }
        },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
      );
      sample();
      refreshTimer = window.setInterval(sample, 60000);
    };
    const stop = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer);
        refreshTimer = null;
      }
    };

    let cancelled = false;
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (cancelled) return;
      permission = result;
      permissionChange = () => {
        if (permission.state === "granted") start();
        else stop();
      };
      permission.addEventListener("change", permissionChange);
      start();
    }).catch((error) => {
      console.warn("Could not check location permission for local history:", error);
    });

    return () => {
      cancelled = true;
      disposed = true;
      stop();
      permission?.removeEventListener("change", permissionChange);
    };
  }, [uid]);

  return null;
}
