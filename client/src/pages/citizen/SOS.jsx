import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Contact, ExternalLink, MapPin, MessageSquare, Minus, Plus, Satellite, Share2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { sosApi } from "../../services/sosService";
import { familyApi } from "../../services/familyService";
import { enqueue, getLocationHistory, getMeta, getQueue, pruneLocationHistory, removeFromQueue, saveLocationSnapshot, setMeta, updateQueueItem } from "../../offline/queue";
import { flushQueue, onDropped, onFailed, onSynced, requestBackgroundSync } from "../../offline/sync";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import useBackendStatus from "../../hooks/useBackendStatus";
import useQueue from "../../hooks/useQueue";
import { newId } from "../../utils/id";
import { errMsg } from "../../utils/errMsg";
import { gpsFixFromPosition, isValidGpsFix, moreAccurateGpsFix } from "../../utils/sosLocation";
import { selectLocationSnapshot } from "../../utils/sosLocationHistory";
import { classifySosSubmissionError, sosSubmissionStatus } from "../../utils/sosSubmission";
import { buildSosMessage, getSmsLengthInfo, normalizePhoneNumber, sendSosSms } from "../../utils/sosSms";
import GlassCard from "../../components/ui/GlassCard";
import SOSButton from "../../components/sos/SOSButton";
import OnlineBanner from "../../components/sos/OnlineBanner";
import ActiveSOSCard, { NEED_LABELS } from "../../components/sos/ActiveSOSCard";
import MedicalForm from "../../components/sos/MedicalForm";
import SOSHistory from "../../components/sos/SOSHistory";
import SOSLocationMap from "../../components/sos/SOSLocationMap";

function readLastFix(uid) {
  try {
    const fix = JSON.parse(localStorage.getItem(`ark_last_fix_${uid}`));
    const valid = isValidGpsFix(fix);
    logSos(valid ? "cached location found" : "cached location missing or invalid");
    return valid ? { ...fix, source: "last_known" } : null;
  } catch (error) {
    console.warn("Could not read the cached SOS location:", error);
    return null;
  }
}

function cacheGpsFix(uid, fix) {
  try {
    localStorage.setItem(`ark_last_fix_${uid}`, JSON.stringify(fix));
    return true;
  } catch (error) {
    console.warn("Could not cache a successful SOS GPS fix:", error);
    return false;
  }
}

function requestCurrentPosition() {
  logSos("fresh GPS request started");
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      logSos("fresh GPS request unavailable", { reason: "unsupported" });
      resolve({ fix: null, error: "Location is not supported by this browser." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const fix = gpsFixFromPosition(position);
        logSos(fix ? "fresh GPS fix acquired" : "fresh GPS fix invalid", {
          valid: Boolean(fix),
          accuracyMeters: fix?.accuracy ?? null,
        });
        resolve(fix
          ? { fix }
          : { fix: null, error: "The device returned an invalid GPS position." });
      },
      (error) => {
        const reason = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Enable it in browser settings or enter coordinates manually."
          : error.code === error.TIMEOUT
            ? "Could not get a fresh location before timeout. Use the labeled last-known location or enter coordinates manually."
            : "Current location is unavailable. Use the labeled last-known location or enter coordinates manually.";
        logSos("fresh GPS request failed", { code: error.code || null });
        resolve({ fix: null, error: reason });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

const SOURCE_LABELS = {
  fresh_device: "Fresh device position",
  last_known: "Last known location — may be outdated",
  last_recorded: "Last recorded GPS position — not current",
  manual: "Manually entered location",
  unknown: "Location source not recorded",
};

function logSos(event, details = {}) {
  if (import.meta.env.DEV) console.debug(`[sos] ${event}`, details);
}

const currentTimestamp = () => Date.now();

function timestampSnapshot() {
  const ms = Date.now();
  return { ms, iso: new Date(ms).toISOString() };
}

function toIsoTimestamp(value) {
  return new Date(value).toISOString();
}

function inferLocationSource(timestamp, now = Date.now()) {
  const at = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(at)) return "unknown";
  return now - at >= 0 && now - at < 120000 ? "fresh_device" : "last_known";
}

export default function SOS() {
  const { profile } = useAuth();
  const uid = profile.uid;
  const online = useOnlineStatus();
  const backendStatus = useBackendStatus(online);
  const offlineEmergency = !online || backendStatus === "offline" || backendStatus === "unavailable";
  const { items: queue, pending } = useQueue(uid);
  const [fix, setFix] = useState(() => readLastFix(uid));
  const [locationHistory, setLocationHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyChoice, setHistoryChoice] = useState("latest");
  const [confirmedHistoryId, setConfirmedHistoryId] = useState("");

  const [mine, setMine] = useState([]);
  const [mineError, setMineError] = useState("");
  const [medical, setMedical] = useState(null);
  const [familyContacts, setFamilyContacts] = useState([]);
  const [familyLoadError, setFamilyLoadError] = useState("");
  const [phoneContacts, setPhoneContacts] = useState([]);
  const [manualContacts, setManualContacts] = useState([]);
  const [selectedContactKeys, setSelectedContactKeys] = useState([]);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [contactError, setContactError] = useState("");
  const [needs, setNeeds] = useState([]);
  const [peopleCount, setPeopleCount] = useState(1);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [startedLocal, setStartedLocal] = useState(false);
  const [emergencyLocation, setEmergencyLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationError, setLocationError] = useState("");
  const [renderNow, setRenderNow] = useState(() => Date.now());
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [landmark, setLandmark] = useState("");
  const [locality, setLocality] = useState("");
  const [trappedDescription, setTrappedDescription] = useState("");
  const [locationDetailsConfirmed, setLocationDetailsConfirmed] = useState(false);
  const [smsDraft, setSmsDraft] = useState("");
  const [smsStatus, setSmsStatus] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [smsFallbackReady, setSmsFallbackReady] = useState(false);
  const [liveSharing, setLiveSharing] = useState(false);
  const [liveUpdateAt, setLiveUpdateAt] = useState(null);
  const [liveUpdateError, setLiveUpdateError] = useState("");

  const queued = queue.find((i) => i.type === "sos") || null;
  const active = mine.find((s) => s.status === "active") || null;
  const detailsRecord = queued?.payload || active;
  const detailsRecordId = queued?.payload?.clientId || active?.clientId || active?.id || "";
  const smsLocationDetails = { landmark, locality, trappedDescription };
  const phase = queued ? "queued" : active ? "active" : "idle";
  const emergencyOpen = phase !== "idle" || startedLocal;
  const selectedHistorySnapshot = selectLocationSnapshot(locationHistory, historyChoice);
  const confirmedHistorySnapshot = selectedHistorySnapshot?.id === confirmedHistoryId
    ? selectedHistorySnapshot
    : null;

  const fixRef = useRef(fix);
  const localIncidentRef = useRef(null);
  const locationRequestRef = useRef(null);
  const locationWatchRef = useRef(null);
  const locationWatchFinishRef = useRef(null);
  const mountedRef = useRef(true);
  const submissionFallbackTimerRef = useRef(null);
  const sosAttemptRef = useRef(false);
  const submissionStartedRef = useRef(false);
  const fallbackPreparedRef = useRef(new Set());
  const smsComposerAttemptedRef = useRef(false);
  const liveSharingRef = useRef(liveSharing);
  const hydratedDetailsIncidentRef = useRef("");

  useEffect(() => { fixRef.current = fix; }, [fix]);
  useEffect(() => {
    if (!detailsRecordId || hydratedDetailsIncidentRef.current === detailsRecordId || !detailsRecord) return;
    hydratedDetailsIncidentRef.current = detailsRecordId;
    setLandmark(detailsRecord.landmark || "");
    setLocality(detailsRecord.locality || "");
    setTrappedDescription(detailsRecord.trappedDescription || "");
    setLocationDetailsConfirmed(detailsRecord.locationDetailsConfirmed === true);
    if (detailsRecord.locationSource === "manual" && Number.isFinite(Number(detailsRecord.lat ?? detailsRecord.location?.lat))) {
      setManualLat(String(detailsRecord.lat ?? detailsRecord.location.lat));
      setManualLng(String(detailsRecord.lng ?? detailsRecord.location.lng));
    }
  }, [detailsRecord, detailsRecordId]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(submissionFallbackTimerRef.current);
      locationWatchFinishRef.current?.(null);
    };
  }, []);
  useEffect(() => {
    if (!emergencyOpen) return undefined;
    const timer = setInterval(() => setRenderNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [emergencyOpen]);

  const recordGpsSnapshot = useCallback(async (gpsFix) => {
    if (!isValidGpsFix(gpsFix)) throw new Error("Refusing to store an invalid GPS position.");
    const snapshot = { ...gpsFix, id: newId(), uid, source: "fresh_device" };
    await saveLocationSnapshot(snapshot);
    await pruneLocationHistory(uid);
    setLocationHistory((current) => [snapshot, ...current.filter((entry) => entry.id !== snapshot.id)]
      .sort((a, b) => b.at - a.at));
    return snapshot;
  }, [uid]);

  useEffect(() => {
    let mounted = true;
    getLocationHistory(uid, Date.now() - 30 * 60 * 1000)
      .then((history) => {
        if (!mounted) return;
        setLocationHistory(history);
        setHistoryError("");
        if (!fixRef.current && history[0]) {
          const last = { ...history[0], source: "last_known" };
          fixRef.current = last;
          setFix(last);
        }
      })
      .catch((error) => {
        if (mounted) setHistoryError(`Could not load saved GPS history: ${errMsg(error)}`);
      })
      .finally(() => {
        if (mounted) setHistoryLoading(false);
      });
    return () => { mounted = false; };
  }, [uid]);

  const loadMine = useCallback(async () => {
    try {
      setMine(await sosApi.mine());
      setMineError("");
    } catch (error) {
      setMineError(errMsg(error));
    }
  }, []);

  useEffect(() => {
    if (online && backendStatus === "available") void loadMine();
  }, [backendStatus, loadMine, online]);
  useEffect(() => onSynced(({ item }) => {
    if (item.type === "sos" && item.uid === uid) {
      setSubmissionError("");
      if (item.id === localIncidentRef.current) {
        clearTimeout(submissionFallbackTimerRef.current);
        setSubmissionStatus(smsComposerAttemptedRef.current
          ? "Online SOS submitted successfully. The SMS composer may be open; ArkGrid cannot determine whether you sent its message."
          : "Online SOS submitted successfully");
        setSmsFallbackReady(false);
      }
    }
    loadMine();
  }), [loadMine, uid]);
  useEffect(() => onDropped(({ item, message: failure }) => {
    if (item?.type === "sos" && item.uid === uid && !fallbackPreparedRef.current.has(item.id)) {
      clearTimeout(submissionFallbackTimerRef.current);
      const messageText = failure || "The response system rejected this SOS; it was not recorded.";
      setSmsFallbackReady(false);
      setSubmissionError(messageText);
      setSubmissionStatus(messageText);
    }
  }), [uid]);

  // Medical profile: server first, IndexedDB copy when offline
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cached = await getMeta(`medical_${uid}`);
        if (mounted && cached) {
          setMedical(cached);
          logSos("cached emergency contacts loaded", { count: cached.contacts?.length || 0 });
        }
      } catch (error) {
        logSos("could not read cached medical profile", { message: errMsg(error) });
      }
      if (!mounted || !online || backendStatus !== "available") return;
      try {
        const m = await sosApi.getMedical();
        if (!mounted) return;
        setMedical(m);
        try {
          await setMeta(`medical_${uid}`, m);
        } catch (error) {
          logSos("could not cache refreshed emergency contacts", { message: errMsg(error) });
        }
        logSos("emergency contacts refreshed from response system", { count: m.contacts?.length || 0 });
      } catch (error) {
        logSos("emergency profile refresh failed", { message: errMsg(error) });
      }
    })();
    return () => { mounted = false; };
  }, [backendStatus, online, uid]);

  useEffect(() => {
    let mounted = true;
    let cachedContactsLoaded = false;
    const cacheKey = `family_sos_contacts_${uid}`;
    (async () => {
      try {
        const cached = await getMeta(cacheKey);
        if (mounted && Array.isArray(cached)) {
          setFamilyContacts(cached);
          cachedContactsLoaded = cached.length > 0;
          logSos("cached Family Network contacts loaded", { count: cached.length });
        }
      } catch (error) {
        logSos("could not read cached Family Network contacts", { message: errMsg(error) });
      }
      if (!mounted || !online || backendStatus !== "available") return;
      try {
        const families = await familyApi.list();
        const contacts = families.flatMap((family) =>
          family.members
            .filter((member) => member.uid !== uid && member.phone)
            .map((member) => ({ uid: member.uid, name: member.name, phone: member.phone }))
        );
        if (mounted) {
          setFamilyContacts(contacts);
          setFamilyLoadError("");
          logSos("Family Network contacts loaded", { count: contacts.length });
        }
        try {
          await setMeta(cacheKey, contacts);
        } catch (error) {
          logSos("could not cache Family Network contacts", { message: errMsg(error) });
        }
      } catch (error) {
        if (mounted) {
          setFamilyLoadError(errMsg(error));
          if (!cachedContactsLoaded) {
            setFamilyLoadError(`${errMsg(error)} No locally cached Family Network contacts are available.`);
          }
        }
        logSos("Family Network contact request failed", { message: errMsg(error) });
      }
    })();
    return () => { mounted = false; };
  }, [backendStatus, online, uid]);

  const contacts = [
    ...(medical?.contacts || []).map((contact, index) => ({
      ...contact, key: `medical:${index}:${contact.phone}`, source: "Saved emergency contact",
    })),
    ...familyContacts.map((contact) => ({
      ...contact, key: `family:${contact.uid}`, source: "Family Network",
    })),
    ...phoneContacts,
    ...manualContacts,
  ].reduce((list, contact) => {
    const phone = normalizePhoneNumber(contact.phone);
    if (!phone || list.some((item) => item.phone === phone)) return list;
    list.push({ ...contact, phone });
    return list;
  }, []);
  const selectedContacts = contacts.filter((contact) => selectedContactKeys.includes(contact.key));
  const hasSelectedContacts = selectedContacts.length > 0;

  useEffect(() => {
    if (selectedContactKeys.length) {
      logSos("selected emergency recipient validation", {
        selected: selectedContactKeys.length,
        valid: selectedContacts.length,
      });
    }
  }, [selectedContactKeys, selectedContacts.length]);

  const buildFallbackSms = useCallback((location, incidentNeeds, emergencyId, details = {}) => buildSosMessage({
    reason: incidentNeeds.map((need) => NEED_LABELS[need] || need).join(", ") || "Not specified",
    location,
    emergencyId,
    ageMs: location?.source === "last_recorded"
      ? Math.max(0, Date.now() - new Date(location.at).getTime())
      : undefined,
    landmark: details.landmark,
    locality: details.locality,
    trappedDescription: details.trappedDescription,
  }), []);

  const prepareFallbackSms = useCallback(({ id, location, incidentNeeds, kind, details = {} }) => {
    if (fallbackPreparedRef.current.has(id)) return;
    if (details.locationDetailsConfirmed !== true) {
      setSubmissionStatus("The online SOS has not been acknowledged. Confirm location details before preparing an SMS fallback.");
      setSmsStatus("Confirm the location, landmark, locality, and emergency details before preparing an SMS.");
      return;
    }
    fallbackPreparedRef.current.add(id);
    clearTimeout(submissionFallbackTimerRef.current);
    logSos("SMS fallback selected", { kind: kind || "offline" });
    setSmsDraft(buildFallbackSms(location, incidentNeeds, id, details));
    setSmsFallbackReady(true);
    setSubmissionStatus("Internet or server unavailable; preparing SMS fallback");
    setSmsStatus(hasSelectedContacts
      ? "SMS prepared. Tap Open SMS application, then review it and tap Send. ArkGrid has not sent or delivered an SMS."
      : "SMS prepared, but no responder is selected. Choose a Family Network or saved emergency contact, or add a valid number here. No number will be invented.");
    if (kind) setSubmissionError(sosSubmissionStatus({ kind }));
  }, [buildFallbackSms, hasSelectedContacts]);

  const handleSubmissionFailure = useCallback(({ id, location, incidentNeeds, failure, details }) => {
    const status = sosSubmissionStatus(failure);
    if (["network", "timeout", "server", "endpoint"].includes(failure.kind)) {
      logSos("online SOS failed; SMS fallback prepared", {
        kind: failure.kind,
        status: failure.status || null,
      });
      prepareFallbackSms({ id, location, incidentNeeds, kind: failure.kind, details });
      return;
    }
    clearTimeout(submissionFallbackTimerRef.current);
    setSmsFallbackReady(false);
    setSubmissionStatus(status);
    setSubmissionError(status);
    logSos("online SOS rejected", { kind: failure.kind, status: failure.status || null });
  }, [prepareFallbackSms]);

  useEffect(() => onFailed(({ item, failure }) => {
    if (item?.type !== "sos" || item.uid !== uid || item.id !== localIncidentRef.current) return;
    const payload = item.payload || {};
    const hasLocation = Number.isFinite(payload.lat) && Number.isFinite(payload.lng);
    const location = hasLocation
      ? {
        lat: payload.lat,
        lng: payload.lng,
        accuracy: payload.accuracy,
        at: payload.capturedAt,
        source: ["fresh_device", "last_known", "last_recorded", "manual"].includes(payload.locationSource)
          ? payload.locationSource
          : "unknown",
      }
      : null;
    handleSubmissionFailure({
      id: item.id,
      location,
      incidentNeeds: payload.needs || [],
      details: payload,
      failure,
    });
  }), [handleSubmissionFailure, uid]);

  const activeLocationSource = active?.location?.source || active?.locationSource;
  const activeLocation = active?.location
    ? {
      ...active.location,
      at: active.locationAt,
      source: ["last_recorded", "last_known", "manual", "unknown"].includes(activeLocationSource)
        ? activeLocationSource
        : inferLocationSource(active.locationAt, renderNow),
    }
    : null;
  const queuedLocation = queued && queued.payload.lat != null && queued.payload.lng != null
    ? {
      lat: queued.payload.lat,
      lng: queued.payload.lng,
      accuracy: queued.payload.accuracy,
      at: queued.payload.capturedAt,
      source: queued.payload.locationSource === "manual"
        ? "manual"
        : queued.payload.locationSnapshotId
          ? "last_recorded"
          : inferLocationSource(queued.payload.capturedAt, renderNow),
      id: queued.payload.locationSnapshotId || undefined,
    }
    : null;
  const fallbackLocation = fix
    ? {
      ...fix,
      source: ["manual", "last_known", "last_recorded"].includes(fix.source)
        ? fix.source
        : inferLocationSource(fix.at, renderNow),
    }
    : null;
  const locationCandidate = emergencyLocation || activeLocation || queuedLocation || fallbackLocation;
  const displayLocation = locationCandidate?.source === "fresh_device" && inferLocationSource(locationCandidate.at, renderNow) === "last_known"
    ? { ...locationCandidate, source: "last_known" }
    : locationCandidate;
  const lastLiveUpdateAt = liveUpdateAt || (active?.lastPingAt ? Date.parse(active.lastPingAt) : null);
  const liveUpdateAge = lastLiveUpdateAt
    ? Math.max(0, Math.floor((renderNow - lastLiveUpdateAt) / 1000))
    : null;
  const smsLengthInfo = smsDraft ? getSmsLengthInfo(smsDraft) : null;

  const saveFreshLocation = async (freshFix) => {
    fixRef.current = freshFix;
    setFix(freshFix);
    setEmergencyLocation(freshFix);
    setLocationStatus("fresh");
    let cacheError = "";
    if (!cacheGpsFix(uid, freshFix)) cacheError = "Fresh GPS location could not be saved as the quick last-known fix.";
    try {
      await recordGpsSnapshot(freshFix);
    } catch (error) {
      cacheError = `Fresh GPS location could not be saved to GPS history: ${errMsg(error)}`;
    }
    setLocationError(cacheError);
    setSubmissionStatus("Preparing emergency request");

    const payload = {
      lat: freshFix.lat,
      lng: freshFix.lng,
      accuracy: freshFix.accuracy,
      capturedAt: new Date(freshFix.at).toISOString(),
      locationSource: freshFix.source,
    };
    const incidentId = localIncidentRef.current;
    if (!incidentId) return freshFix;
    try {
      const pendingItem = incidentId
        ? (await getQueue(uid)).find((item) => item.id === incidentId)
        : null;
      if (pendingItem) {
        await updateQueueItem(incidentId, { payload: { ...pendingItem.payload, ...payload } });
        return freshFix;
      }
    } catch (error) {
      setLocationError(`Fresh location acquired but could not update the saved SOS: ${errMsg(error)}`);
      return freshFix;
    }
    void sosApi.mine()
      .then((incidents) => incidents.find((item) => item.status === "active"))
      .then((current) => current ? sosApi.ping(current.id, payload) : null)
      .catch((error) => {
        if (mountedRef.current) {
          setLocationError(`Fresh location acquired but could not update the response system: ${errMsg(error)}`);
        }
      });
    return freshFix;
  };

  const beginLocationAcquisition = () => {
    if (locationRequestRef.current) return locationRequestRef.current;
    setRenderNow(currentTimestamp());
    setLocationStatus("acquiring");
    setLocationError("");
    setSubmissionStatus("Getting current location");
    const request = requestCurrentPosition().then(async ({ fix: freshFix, error }) => {
      if (freshFix) return saveFreshLocation(freshFix);

      const last = isValidGpsFix(fixRef.current) ? { ...fixRef.current, source: "last_known" } : null;
      if (last) {
        fixRef.current = last;
        setFix(last);
        setEmergencyLocation(last);
      }
      setLocationStatus(last ? "last_known" : "unavailable");
      setLocationError(error);
      setSubmissionStatus(last ? "Using last known position" : "Current location unavailable");
      if (last) logSos("using validated cached location after GPS failure");
      return last;
    }).catch((error) => {
      const last = isValidGpsFix(fixRef.current) ? { ...fixRef.current, source: "last_known" } : null;
      setLocationStatus(last ? "last_known" : "unavailable");
      setLocationError(`Could not save the acquired location: ${errMsg(error)}`);
      setSubmissionStatus(last ? "Using last known position" : "Current location unavailable");
      return last;
    });
    locationRequestRef.current = request;
    return request;
  };

  const retryLocation = async () => {
    if (locationWatchRef.current !== null) return;
    setLocationStatus("acquiring");
    setLocationError("");
    setSubmissionStatus("Retrying location for up to 10 seconds");

    let best = null;
    let watchError = "";
    if (navigator.geolocation) {
      best = await new Promise((resolve) => {
        let settled = false;
        let candidateBest = null;
        let watchId;
        let timer;
        const finish = (selected = candidateBest) => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) window.clearTimeout(timer);
          if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
          locationWatchRef.current = null;
          locationWatchFinishRef.current = null;
          resolve(selected);
        };
        locationWatchFinishRef.current = finish;
        try {
          watchId = navigator.geolocation.watchPosition(
            (position) => {
              if (settled) return;
              const candidate = gpsFixFromPosition(position);
              if (!candidate) return;
              if (!cacheGpsFix(uid, candidate)) {
                setLocationError("A GPS reading was received but could not be cached on this device.");
              }
              void recordGpsSnapshot(candidate).catch((error) => {
                setLocationError(`A GPS reading was received but could not be saved to history: ${errMsg(error)}`);
              });
              candidateBest = moreAccurateGpsFix(candidateBest, candidate);
            },
            (error) => {
              if (error.code === error.PERMISSION_DENIED) {
                watchError = "Location permission was denied. Check your browser settings and try again.";
                setLocationError(watchError);
                finish();
              }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
          locationWatchRef.current = watchId;
          if (settled) {
            navigator.geolocation.clearWatch(watchId);
            locationWatchRef.current = null;
          } else {
            timer = window.setTimeout(() => finish(), 10000);
          }
        } catch (error) {
          watchError = `Could not watch device location: ${errMsg(error)}`;
          setLocationError(watchError);
          finish();
        }
      });
    }
    if (!mountedRef.current) return;

    const selectedFix = best
      ? await saveFreshLocation(best)
      : isValidGpsFix(fixRef.current)
        ? { ...fixRef.current, source: "last_known" }
        : null;
    if (!best) {
      if (selectedFix) {
        fixRef.current = selectedFix;
        setFix(selectedFix);
        setEmergencyLocation(selectedFix);
        setLocationStatus("last_known");
        setLocationError(watchError
          ? `${watchError} Using the last known position.`
          : "No new GPS reading was received; using the last known position.");
        setSubmissionStatus("Using last known position");
      } else {
        setEmergencyLocation(null);
        setLocationStatus("unavailable");
        setLocationError(watchError || "No GPS reading or last known position is available.");
        setSubmissionStatus("Current location unavailable");
      }
    } else {
      setSubmissionStatus("Current GPS location updated");
    }

    if (smsFallbackReady) {
      const incidentNeeds = queued?.payload?.needs || active?.needs || needs;
      setSmsDraft(buildFallbackSms(selectedFix, incidentNeeds, localIncidentRef.current, smsLocationDetails));
      setSmsStatus(hasSelectedContacts
        ? "SMS message updated with the latest location. Tap Open SMS application, then review it and tap Send."
        : "SMS message updated. Choose or configure an emergency contact before opening the SMS application.");
    }
  };

  useEffect(() => {
    if (phase !== "active" || !liveSharing || !online || backendStatus !== "available") return;
    const update = () => {
      if (!liveSharingRef.current || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (!liveSharingRef.current) return;
          const current = gpsFixFromPosition(position);
          if (!current) {
            setLiveUpdateError("The device returned an invalid GPS position. Live sharing will retry.");
            return;
          }
          if (!cacheGpsFix(uid, current)) {
            setLocationError("Fresh GPS location is available but could not be saved to this device.");
          }
          void recordGpsSnapshot(current).catch((error) => {
            setLocationError(`Fresh GPS location could not be saved to history: ${errMsg(error)}`);
          });
          fixRef.current = current;
          setFix(current);
          setEmergencyLocation(current);
          try {
            await sosApi.ping(active.id, {
              lat: current.lat,
              lng: current.lng,
              accuracy: current.accuracy,
              capturedAt: new Date(current.at).toISOString(),
              locationSource: current.source,
            });
            setLiveUpdateAt(Date.now());
            setLiveUpdateError("");
          } catch (error) {
            setLiveUpdateError(errMsg(error));
          }
        },
        (error) => {
          if (liveSharingRef.current) {
            setLiveUpdateError(error.code === error.PERMISSION_DENIED
              ? "Location permission was denied. Live sharing is paused."
              : "Could not refresh the device location. Live sharing will retry.");
          }
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
      );
    };
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [phase, liveSharing, online, backendStatus, active?.id, recordGpsSnapshot, uid]);

  const activate = async () => {
    if (submissionStartedRef.current || sending || phase !== "idle") return;
    submissionStartedRef.current = true;
    sosAttemptRef.current = true;
    setSending(true);
    let queuedIncident = false;
    try {
      setSubmissionStatus("Preparing emergency request");
      const locationPromise = offlineEmergency
        ? Promise.resolve(confirmedHistorySnapshot)
        : locationRequestRef.current || beginLocationAcquisition();
      const acquiredLocation = await locationPromise;
      locationRequestRef.current = null;
      const { ms: nowMs, iso: triggeredAt } = timestampSnapshot();
      const id = newId();
      const cached = offlineEmergency
        ? acquiredLocation
        : acquiredLocation || emergencyLocation || fixRef.current;
      const location = cached
        ? {
          ...cached,
          source: offlineEmergency
            ? "last_recorded"
            : cached.source === "manual"
              ? "manual"
              : cached.source === "fresh_device"
                ? "fresh_device"
                : "last_known",
        }
        : null;
      localIncidentRef.current = id;
      setRenderNow(currentTimestamp());
      setStartedLocal(true);
      setEmergencyLocation(location);
      setSmsStatus("");
      setSmsDraft("");
      setSmsFallbackReady(false);
      smsComposerAttemptedRef.current = false;
      setSubmissionError("");
      await enqueue({
        id, uid, type: "sos", createdAt: nowMs, attempts: 0,
        payload: {
          clientId: id,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
          accuracy: location?.accuracy ?? null,
          locationSource: location?.source || null,
          locationSnapshotId: location?.id || null,
          capturedAt: toIsoTimestamp(location?.at || nowMs),
          triggeredAt,
          message, peopleCount, needs,
          landmark, locality, trappedDescription,
          locationDetailsConfirmed: false,
        },
      });
      queuedIncident = true;
      navigator.vibrate?.([200, 100, 200]);
      if (!offlineEmergency) {
        setSubmissionStatus("Sending SOS through the online response system");
        logSos("online SOS submission started");
        const submitRequest = flushQueue(uid);
        submissionFallbackTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current || fallbackPreparedRef.current.has(id)) return;
          if (!locationDetailsConfirmed) {
            setSubmissionStatus("The online response has not acknowledged the SOS yet. Confirm location details before preparing an SMS fallback.");
            setSmsStatus("Confirm the location, landmark, locality, and emergency details before preparing an SMS.");
            return;
          }
          logSos("online acknowledgement delayed; enabling SMS fallback", { delayMs: 5000 });
          setSmsDraft(buildFallbackSms(location, needs, id, smsLocationDetails));
          setSmsFallbackReady(true);
          setSubmissionStatus("The online response has not acknowledged the SOS yet. SMS fallback is available if needed.");
          setSmsStatus(hasSelectedContacts
            ? "SMS message is prepared. If the response system remains unreachable, tap Open SMS Application, review the message, and tap Send."
            : "SMS message is prepared, but no trusted contact is selected. Choose or configure a valid responder number.");
        }, 5000);

        void submitRequest.then((result) => {
          if (!mountedRef.current) return;
          if (result.inProgress) return;
          clearTimeout(submissionFallbackTimerRef.current);
          if (result.synced.some((item) => item.id === id)) {
            setSubmissionStatus(smsComposerAttemptedRef.current
              ? "Online SOS submitted successfully. The SMS composer may be open; ArkGrid cannot determine whether you sent its message."
              : "Online SOS submitted successfully");
            setSmsFallbackReady(false);
            logSos("online SOS submission acknowledged");
            return;
          }
          const failure = result.failures.find((item) => item.id === id);
          if (failure) {
            handleSubmissionFailure({ id, location, incidentNeeds: needs, details: smsLocationDetails, failure });
          } else {
            setSubmissionStatus("SOS is saved on this device, awaiting acknowledgement from the response system");
          }
        }).catch((error) => {
          if (!mountedRef.current) return;
          handleSubmissionFailure({
            id,
            location,
            incidentNeeds: needs,
            details: smsLocationDetails,
            failure: {
              kind: classifySosSubmissionError(error),
              status: error?.response?.status || null,
              message: error?.response?.data?.message || "",
            },
          });
        });
      } else {
        logSos("device reports no network; selecting SMS fallback");
        prepareFallbackSms({ id, location, incidentNeeds: needs, kind: "network" });
        void requestBackgroundSync();
        toast("Offline: SOS is saved on this device and has not been transmitted.", { icon: "📡", duration: 7000 });
      }
    } catch (err) {
      setSubmissionError(`SOS could not be submitted: ${errMsg(err)}`);
      if (!queuedIncident) {
        submissionStartedRef.current = false;
        sosAttemptRef.current = false;
        localIncidentRef.current = null;
      }
      toast.error(errMsg(err));
    } finally {
      setSending(false);
    }
  };

  const startSOSCountdown = () => {
    if (sosAttemptRef.current || submissionStartedRef.current || phase !== "idle") return false;
    if (offlineEmergency) {
      if (historyLoading) {
        setSubmissionStatus("Wait for locally saved GPS history to finish loading, then confirm the position you want to use.");
        return false;
      }
      if (selectedHistorySnapshot && !confirmedHistorySnapshot) {
        setSubmissionStatus("Confirm the selected saved GPS position before starting offline SOS.");
        return false;
      }
      sosAttemptRef.current = true;
      setSubmissionStatus(selectedHistorySnapshot
        ? "Using the confirmed last-recorded GPS position"
        : "No saved GPS position is available; SOS will be saved without coordinates");
      return true;
    }
    sosAttemptRef.current = true;
    logSos("SOS button tapped");
    setSubmissionStatus("Getting current location");
    beginLocationAcquisition();
    return true;
  };

  const cancelSOSCountdown = () => {
    if (submissionStartedRef.current) return;
    sosAttemptRef.current = false;
    locationRequestRef.current = null;
    setSubmissionStatus("");
    setLocationStatus("idle");
  };

  const resolve = async (outcome) => {
    try {
      if (phase === "queued") {
        await removeFromQueue(queued.id);
        localIncidentRef.current = null;
        submissionStartedRef.current = false;
        sosAttemptRef.current = false;
        setStartedLocal(false);
        setLiveSharing(false);
        liveSharingRef.current = false;
        toast("Queued SOS cancelled");
        return;
      }
      await sosApi.resolve(active.id, outcome);
      localIncidentRef.current = null;
      submissionStartedRef.current = false;
      sosAttemptRef.current = false;
      setStartedLocal(false);
      setLiveSharing(false);
      liveSharingRef.current = false;
      toast.success(outcome === "safe" ? "Glad you're safe" : "SOS cancelled");
      await loadMine();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const saveMedical = async (form) => {
    try {
      const saved = await sosApi.saveMedical(form);
      setMedical(saved);
      await setMeta(`medical_${uid}`, saved);
      toast.success("Medical profile saved");
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const toggleNeed = (n) => setNeeds((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));

  const confirmHistoricalLocation = () => {
    if (!selectedHistorySnapshot) {
      setSubmissionStatus("No suitable saved GPS position is available for this choice. No substitute location will be used.");
      return;
    }
    setConfirmedHistoryId(selectedHistorySnapshot.id);
    setSubmissionStatus("Saved GPS position confirmed. It will be labeled as last recorded, not current.");
  };

  const selectPhoneContact = async () => {
    setContactError("");
    if (!navigator.contacts || typeof navigator.contacts.select !== "function") {
      setContactError("This browser does not support the Contact Picker API. Select a Family Network contact or enter a number manually.");
      return;
    }
    try {
      const picked = await navigator.contacts.select(["name", "tel"], { multiple: true });
      const additions = picked.flatMap((contact) => {
        const name = Array.isArray(contact.name) ? contact.name[0] : contact.name;
        const tels = Array.isArray(contact.tel) ? contact.tel : [contact.tel];
        return tels.map(normalizePhoneNumber).filter(Boolean).map((phone) => ({
          key: `phone:${phone}`,
          name: name || "Phone contact",
          phone,
          source: "Selected from this device",
        }));
      });
      setPhoneContacts((current) => [
        ...current,
        ...additions.filter((addition) =>
          !current.some((contact) => normalizePhoneNumber(contact.phone) === addition.phone)
        ),
      ]);
      setSelectedContactKeys((current) => [
        ...new Set([...current, ...additions.map((contact) => contact.key)]),
      ]);
      if (smsFallbackReady && additions.length) {
        setSmsStatus("SMS prepared. Tap Open SMS application, then review it and tap Send. ArkGrid has not sent or delivered an SMS.");
      }
    } catch (error) {
      if (error.name !== "AbortError") setContactError(`Could not read a selected contact: ${errMsg(error)}`);
    }
  };

  const addManualContact = () => {
    const phone = normalizePhoneNumber(manualPhone);
    if (!manualName.trim() || !phone) {
      setContactError("Enter the contact's name and a valid phone number (7–15 digits; include a country code when known).");
      return;
    }
    const key = `manual:${phone}`;
    const contact = { key, name: manualName.trim(), phone, source: "Entered for this SOS" };
    setManualContacts((current) => [...current.filter((item) => item.key !== key), contact]);
    setSelectedContactKeys((current) => [...new Set([...current, key])]);
    setManualName("");
    setManualPhone("");
    setContactError("");
    if (smsFallbackReady) {
      setSmsStatus("SMS prepared. Tap Open SMS application, then review it and tap Send. ArkGrid has not sent or delivered an SMS.");
    }
  };

  const toggleContact = (key) => {
    const next = selectedContactKeys.includes(key)
      ? selectedContactKeys.filter((selectedKey) => selectedKey !== key)
      : [...selectedContactKeys, key];
    setSelectedContactKeys(next);
    if (smsFallbackReady) {
      setSmsStatus(next.length
        ? "SMS prepared. Tap Open SMS application, then review it and tap Send. ArkGrid has not sent or delivered an SMS."
        : "SMS prepared, but no responder is selected. Choose a Family Network or saved emergency contact, or add a valid number here. No number will be invented.");
    }
  };

  const prepareSms = () => {
    if (!locationDetailsConfirmed) {
      setSmsStatus("Confirm the location, landmark, locality, and emergency details before preparing an SMS.");
      toast.error("Confirm location details before preparing the SMS.");
      return;
    }
    const selected = contacts.filter((contact) => selectedContactKeys.includes(contact.key));
    const incidentNeeds = queued?.payload?.needs || active?.needs || needs;
    const text = buildFallbackSms(
      displayLocation,
      incidentNeeds,
      queued?.id || active?.id || localIncidentRef.current,
      smsLocationDetails
    );
    setSmsDraft(text);
    setSmsFallbackReady(false);
    if (!selected.length) {
      setSmsStatus("No valid responder number is selected. Add or select an emergency contact to open the SMS application, or copy this prepared message.");
      return;
    }
    setSmsStatus("Opening the SMS application. Review the recipient and message, then tap Send; ArkGrid cannot verify delivery.");
    if (!sendSosSms({ numbers: selected.map((contact) => contact.phone), text })) {
      setSmsStatus("Unable to open the SMS application. Check the responder number or copy the prepared message below.");
      toast.error("Unable to open the SMS application. Copy the message below and use your messaging app.");
      return;
    }
    smsComposerAttemptedRef.current = true;
    setSmsStatus("SMS composer launch attempted. If it opens, review the message and tap Send; ArkGrid cannot verify whether it opened or was sent.");
  };

  const openPreparedSms = () => {
    logSos("SMS open requested", { validSelectedRecipients: selectedContacts.length });
    if (!locationDetailsConfirmed) {
      setSmsStatus("Location details changed or have not been confirmed. Confirm them before opening the SMS application.");
      return;
    }
    if (!selectedContacts.length) {
      setSmsStatus("No valid responder number is selected. Choose a Family Network or saved contact, or add a valid number.");
      return;
    }
    setSmsStatus("Opening the SMS application. Review the message and tap Send; ArkGrid cannot verify delivery.");
    if (!sendSosSms({ numbers: selectedContacts.map((contact) => contact.phone), text: smsDraft })) {
      setSmsStatus("Unable to open the SMS application or no valid responder number is configured. Copy the prepared message below.");
      return;
    }
    smsComposerAttemptedRef.current = true;
    setSmsStatus("SMS composer launch attempted. If it opens, review the message and tap Send; ArkGrid cannot verify whether it opened or was sent.");
  };

  const copySms = async () => {
    if (!locationDetailsConfirmed) {
      setSmsStatus("Confirm the location details before copying the prepared SMS.");
      return;
    }
    try {
      await navigator.clipboard.writeText(smsDraft);
      toast.success("Emergency message copied");
    } catch (error) {
      toast.error(`Could not copy the message: ${errMsg(error)}`);
    }
  };

  const markLocationDetailsChanged = () => {
    setLocationDetailsConfirmed(false);
    setSmsDraft("");
    setSmsFallbackReady(false);
    setSmsStatus("Location details changed. Confirm the complete location information before preparing an SMS.");
  };

  const saveManualLocation = async () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!manualLat.trim() || !manualLng.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      toast.error("Enter valid coordinates (latitude −90 to 90, longitude −180 to 180).");
      return;
    }
    const location = { lat, lng, accuracy: null, at: currentTimestamp(), source: "manual" };
    setEmergencyLocation(location);
    setLocationStatus("manual");
    setLocationError("");
    markLocationDetailsChanged();
    const payload = {
      lat,
      lng,
      accuracy: null,
      capturedAt: new Date(location.at).toISOString(),
      locationSource: location.source,
      locationSnapshotId: null,
    };
    try {
      const pendingItem = queued
        ? (await getQueue(uid)).find((item) => item.id === queued.id)
        : null;
      if (pendingItem) {
        await updateQueueItem(pendingItem.id, { payload: { ...pendingItem.payload, ...payload } });
        toast.success("Manual location saved with the pending SOS");
      } else if (active) {
        await sosApi.ping(active.id, payload);
        toast.success("Manual location updated on the active SOS");
      } else {
        throw new Error("The SOS is not yet available in the local queue or response system.");
      }
    } catch (error) {
      const failure = `Location is shown on this device but could not be saved to the response system: ${errMsg(error)}`;
      setLocationError(failure);
      toast.error(failure);
    }
  };

  const confirmLocationDetails = async () => {
    const hasLat = manualLat.trim().length > 0;
    const hasLng = manualLng.trim().length > 0;
    if (hasLat !== hasLng) {
      toast.error("Enter both latitude and longitude, or clear both fields.");
      return;
    }

    let location = displayLocation;
    if (hasLat && hasLng) {
      const lat = Number(manualLat);
      const lng = Number(manualLng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90
        || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        toast.error("Enter valid coordinates (latitude −90 to 90, longitude −180 to 180).");
        return;
      }
      location = { lat, lng, accuracy: null, at: currentTimestamp(), source: "manual" };
      setEmergencyLocation(location);
      setLocationStatus("manual");
    }

    const details = {
      landmark: landmark.trim(),
      locality: locality.trim(),
      trappedDescription: trappedDescription.trim(),
      locationDetailsConfirmed: true,
    };
    const payload = { ...details };
    if (location) {
      payload.lat = location.lat;
      payload.lng = location.lng;
      payload.accuracy = location.accuracy ?? null;
      payload.capturedAt = new Date(location.at || Date.now()).toISOString();
      payload.locationSource = location.source || "unknown";
      payload.locationSnapshotId = location.source === "last_recorded" ? location.id || null : null;
    }

    try {
      const localId = queued?.id || localIncidentRef.current;
      const pendingItem = localId
        ? (await getQueue(uid)).find((item) => item.id === localId)
        : null;
      if (pendingItem) {
        await updateQueueItem(pendingItem.id, { payload: { ...pendingItem.payload, ...payload } });
      } else if (active) {
        await sosApi.ping(active.id, payload);
      } else {
        throw new Error("The SOS is not available to save these details yet. Try again after it appears as pending.");
      }
      setLocationDetailsConfirmed(true);
      setLocationError("");
      setSmsStatus("Location details confirmed and saved with this SOS. Review them again in the prepared message.");
      toast.success("Location details confirmed and saved");
    } catch (error) {
      const failure = `Location details were not confirmed or saved: ${errMsg(error)}`;
      setLocationError(failure);
      toast.error(failure);
    }
  };

  const toggleLiveSharing = () => {
    if (!active) {
      toast("Live location sharing is available after the response system acknowledges the SOS.");
      return;
    }
    const next = !liveSharing;
    setLiveSharing(next);
    liveSharingRef.current = next;
    setLiveUpdateError("");
    if (!next) toast("Live location updates stopped.", { icon: "⏸️" });
    else if (!online) setLiveUpdateError("Sharing is paused while offline; updates have not been sent.");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">
          One-Tap <span className="text-gradient">SOS</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Create an authenticated SOS incident, review a location-based message, and choose what to share.
        </p>
      </div>

      <OnlineBanner online={online && backendStatus !== "unavailable"} pending={pending} onSync={() => flushQueue(uid)} />
      {mineError && (
        <p role="status" className="rounded-xl border border-ark-coral/30 bg-ark-coral/5 p-3 text-sm text-ark-coral">
          Could not confirm SOS status with the response system: {mineError}
        </p>
      )}
      {submissionError && (
        <p role="alert" className="rounded-xl border border-ark-coral/30 bg-ark-coral/5 p-3 text-sm text-ark-coral">
          {submissionError} It was not acknowledged as recorded.
        </p>
      )}
      {submissionStatus && (
        <p role="status" aria-live="polite" className="rounded-xl border border-ark-indigo/30 bg-ark-indigo/5 p-3 text-sm text-slate-700">
          {submissionStatus}
        </p>
      )}

      {offlineEmergency && !emergencyOpen && (
        <GlassCard className="space-y-3">
          <div>
            <h2 className="font-display text-xl font-bold">Offline location history</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose a real GPS position saved on this device. Five- and ten-minute choices use the closest snapshot within ±2 minutes; older or missing positions are never substituted.
            </p>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            Location snapshot
            <select
              value={historyChoice}
              onChange={(event) => {
                setHistoryChoice(event.target.value === "latest" ? "latest" : Number(event.target.value));
                setConfirmedHistoryId("");
              }}
              className="input-glass mt-1"
            >
              <option value="latest">Most recent valid GPS position</option>
              <option value="5" disabled={!selectLocationSnapshot(locationHistory, 5)}>Approximately 5 minutes ago</option>
              <option value="10" disabled={!selectLocationSnapshot(locationHistory, 10)}>Approximately 10 minutes ago</option>
            </select>
          </label>
          {historyLoading ? (
            <p role="status" className="text-sm text-slate-600">Loading locally saved GPS history…</p>
          ) : selectedHistorySnapshot ? (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-900">Last-recorded position — not current</p>
              <p className="mt-1 text-slate-700">{selectedHistorySnapshot.lat.toFixed(6)}, {selectedHistorySnapshot.lng.toFixed(6)}</p>
              <p className="mt-1 text-slate-600">Recorded: {new Date(selectedHistorySnapshot.at).toLocaleString()}</p>
              <p className="text-slate-600">
                Age: {Math.floor(selectedHistorySnapshot.ageMs / 60000)} minutes {Math.floor((selectedHistorySnapshot.ageMs % 60000) / 1000)} seconds
                {" · "}GPS accuracy: ±{Math.round(selectedHistorySnapshot.accuracy)} m
              </p>
              <button
                type="button"
                onClick={confirmHistoricalLocation}
                disabled={confirmedHistoryId === selectedHistorySnapshot.id}
                className="mt-3 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
              >
                {confirmedHistoryId === selectedHistorySnapshot.id ? "Location confirmed" : "Confirm selected location"}
              </button>
            </div>
          ) : (
            <p role="status" className="rounded-xl border border-ark-coral/30 bg-ark-coral/5 p-3 text-sm text-slate-700">
              {historyError || (historyChoice === "latest"
                ? "No saved GPS position is available. SOS can still be saved without coordinates."
                : `No GPS snapshot exists within ±2 minutes of ${historyChoice} minutes ago. No substitute location will be used.`)}
            </p>
          )}
          {historyError && selectedHistorySnapshot && <p role="status" className="text-sm text-ark-coral">{historyError}</p>}
        </GlassCard>
      )}

      {!fix && !emergencyOpen && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-indigo/40 bg-ark-indigo/10 px-5 py-3 text-sm text-slate-700">
          <Satellite size={17} />
          No saved location. Location permission will be requested when you start SOS; coordinates can also be entered manually.
        </div>
      )}

      {emergencyOpen && (
        <section className="grid gap-6 lg:grid-cols-2" aria-label="Emergency response details">
          <GlassCard className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-bold">Location for this SOS</h2>
              <p className="mt-1 text-sm text-slate-600">
                {locationStatus === "acquiring" ? "Requesting a fresh device position…" :
                  displayLocation?.source === "last_recorded" ? SOURCE_LABELS.last_recorded :
                    displayLocation?.source === "last_known" ? SOURCE_LABELS.last_known :
                    locationStatus === "manual" ? SOURCE_LABELS.manual :
                      locationStatus === "fresh" ? "Fresh device position acquired." :
                        displayLocation ? SOURCE_LABELS[displayLocation.source] || "Location available" :
                          "No location is available yet."}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                ArkGrid requests device location through the browser; availability and accuracy depend on your device and surroundings. The app does not call an internet geolocation service.
              </p>
            </div>
            {displayLocation ? (
              <>
                <SOSLocationMap location={displayLocation} />
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    <MapPin size={16} />
                    {displayLocation.lat.toFixed(6)}, {displayLocation.lng.toFixed(6)}
                  </p>
                  <p className="mt-1 text-slate-600">
                    Accuracy: {Number.isFinite(displayLocation.accuracy)
                      ? `±${Math.round(displayLocation.accuracy)} m`
                      : "not reported"}
                  </p>
                  <p className="mt-1 text-slate-600">
                    Location time: {displayLocation.at ? new Date(displayLocation.at).toLocaleString() : "not available"}
                  </p>
                  {["last_known", "last_recorded"].includes(displayLocation.source) && (
                    <p className="mt-2 font-semibold text-ark-coral">
                      {displayLocation.source === "last_recorded" ? "Last recorded location — not current." : "Last known location — may be outdated."}
                    </p>
                  )}
                  <a
                    href={`https://maps.google.com/?q=${displayLocation.lat},${displayLocation.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:underline"
                  >
                    <ExternalLink size={14} /> Open this coordinate in Google Maps
                  </a>
                </div>
              </>
            ) : (
              <p className="rounded-xl border border-ark-coral/30 bg-ark-coral/5 p-3 text-sm text-slate-700">
                Location has not been acquired. The SOS can still be saved without coordinates.
              </p>
            )}
            {locationError && <p role="status" className="text-sm text-ark-coral">{locationError}</p>}
            <button
              onClick={retryLocation}
              disabled={locationStatus === "acquiring"}
              className="text-sm font-semibold text-blue-700 hover:underline disabled:cursor-wait disabled:opacity-60"
            >
              Retry Location (up to 10 seconds)
            </button>
            {offlineEmergency && (
              <p className="rounded-xl border border-ark-coral/30 bg-ark-coral/5 p-3 text-sm font-medium text-ark-coral">
                {phase === "active"
                  ? "Internet is unavailable. This incident was previously recorded by the response system, but no live updates are being sent now."
                  : "No internet connection. This SOS is saved on this device and has not been transmitted."} The phone may still be able to open SMS, but cellular SMS service is required to send it.
              </p>
            )}

            <details className="rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">Enter coordinates manually</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <label className="text-xs text-slate-600">
                  Latitude
                  <input value={manualLat} onChange={(event) => { setManualLat(event.target.value); markLocationDetailsChanged(); }} inputMode="decimal" className="input-glass mt-1" placeholder="-90 to 90" />
                </label>
                <label className="text-xs text-slate-600">
                  Longitude
                  <input value={manualLng} onChange={(event) => { setManualLng(event.target.value); markLocationDetailsChanged(); }} inputMode="decimal" className="input-glass mt-1" placeholder="-180 to 180" />
                </label>
                <button onClick={saveManualLocation} className="self-end rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
                  Save coordinates
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Coordinates are optional. Both must be valid; entering only one is rejected. Manually entered coordinates are labeled as not GPS-verified.</p>
            </details>

            <div className="space-y-3 rounded-xl border border-slate-200 p-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Landmark and emergency details</h3>
                <p className="mt-1 text-xs text-slate-600">These are user-provided, not independently verified. Confirm all details before preparing an SMS.</p>
              </div>
              <label className="block text-xs text-slate-600">
                Nearby landmark
                <input value={landmark} maxLength={80} onChange={(event) => { setLandmark(event.target.value); markLocationDetailsChanged(); }} className="input-glass mt-1" placeholder="For example, building entrance or nearby bridge" />
              </label>
              <label className="block text-xs text-slate-600">
                Locality / address
                <input value={locality} maxLength={100} onChange={(event) => { setLocality(event.target.value); markLocationDetailsChanged(); }} className="input-glass mt-1" placeholder="Neighborhood, street, village, or address" />
              </label>
              <label className="block text-xs text-slate-600">
                Trapped location / emergency description
                <textarea value={trappedDescription} maxLength={140} onChange={(event) => { setTrappedDescription(event.target.value); markLocationDetailsChanged(); }} rows={2} className="input-glass mt-1 resize-y" placeholder="Where you are in the building, access constraints, or urgent needs" />
              </label>
              <button type="button" onClick={confirmLocationDetails} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                {locationDetailsConfirmed ? "Location details confirmed — confirm again after edits" : "Confirm and save location details"}
              </button>
              <p role="status" className={`text-xs ${locationDetailsConfirmed ? "text-emerald-700" : "text-amber-700"}`}>
                {locationDetailsConfirmed ? "Confirmed for this SOS." : "Not confirmed. SMS preparation and opening are blocked until you confirm."}
              </p>
            </div>

            {phase === "active" && (
              <div className="rounded-xl border border-slate-200 p-3">
                <button
                  onClick={toggleLiveSharing}
                  aria-pressed={liveSharing}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold ${
                    liveSharing ? "bg-ark-cyan/10 text-cyan-800" : "bg-slate-50 text-slate-800"
                  }`}
                >
                  <span className="flex items-center gap-2"><Share2 size={16} /> Share live location with response team</span>
                  <span>{liveSharing ? "On — stop" : "Off — start"}</span>
                </button>
                <p className="mt-2 text-xs text-slate-600">
                  This sends authenticated updates to ArkGrid's response system every 30 seconds while online. It does not send messages to SMS contacts or create a public live link.
                </p>
                {lastLiveUpdateAt && <p className="mt-2 text-xs text-slate-600">Last successful location update: {new Date(lastLiveUpdateAt).toLocaleTimeString()} ({liveUpdateAge}s ago)</p>}
                {liveSharing && !online && <p role="status" className="mt-2 text-sm text-ark-coral">Offline — no live updates are being transmitted.</p>}
                {liveUpdateError && <p role="status" className="mt-2 text-sm text-ark-coral">{liveUpdateError}</p>}
              </div>
            )}
          </GlassCard>

          <GlassCard className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-bold">Emergency recipients</h2>
              <p className="mt-1 text-sm text-slate-600">Choose who receives a prefilled SMS. Nothing is sent until you confirm in your messaging app.</p>
            </div>
            <button
              onClick={selectPhoneContact}
              className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Contact size={17} /> Select Phone Contact
            </button>
            {contactError && <p role="status" className="text-sm text-ark-coral">{contactError}</p>}
            {familyLoadError && (
              <p role="status" className="rounded-lg bg-ark-coral/5 p-2 text-xs text-ark-coral">
                Could not load Family Network contacts: {familyLoadError}
              </p>
            )}
            {contacts.length > 0 ? (
              <div className="max-h-52 space-y-2 overflow-y-auto">
                {contacts.map((contact) => (
                  <label key={contact.key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <input
                      type="checkbox"
                      checked={selectedContactKeys.includes(contact.key)}
                      onChange={() => toggleContact(contact.key)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{contact.name}</span>
                      <span className="block text-sm text-slate-600">{contact.phone}</span>
                      <span className="block text-xs text-slate-500">{contact.source}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No saved contacts with valid phone numbers were found. Add one below; the app does not upload your phone address book.</p>
            )}

            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="text-xs text-slate-600">
                Name
                <input value={manualName} onChange={(event) => setManualName(event.target.value)} maxLength={60} className="input-glass mt-1" placeholder="Contact name" />
              </label>
              <label className="text-xs text-slate-600">
                Phone
                <input value={manualPhone} onChange={(event) => setManualPhone(event.target.value)} inputMode="tel" maxLength={25} className="input-glass mt-1" placeholder="+ country code if known" />
              </label>
              <button onClick={addManualContact} className="self-end rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800">
                Add
              </button>
            </div>

            {selectedContacts.length > 0 && (
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Review recipients</p>
                {selectedContacts.map((contact) => (
                  <p key={contact.key} className="text-sm text-slate-800">{contact.name} — {contact.phone}</p>
                ))}
              </div>
            )}

            <button
              onClick={smsFallbackReady ? openPreparedSms : prepareSms}
              disabled={!locationDetailsConfirmed}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ark-coral px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageSquare size={17} />
              {smsFallbackReady
                ? selectedContacts.length ? "Open SMS Application" : "Choose or Configure an Emergency Contact"
                : locationDetailsConfirmed
                  ? selectedContacts.length ? "Open SMS App for Selected Contacts" : "Prepare Message for Copying"
                  : "Confirm Location Details First"}
            </button>
            <p className="text-xs text-slate-500">
              A normal browser cannot silently send SMS. The composer requires cellular messaging service and your final confirmation. ArkGrid does not know whether the SMS was sent or delivered.
            </p>
            {smsStatus && <p role="status" className="rounded-lg bg-ark-cyan/10 p-2 text-sm text-slate-800">{smsStatus}</p>}
            {smsDraft && (
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Prepared message — not transmitted</p>
                  <button onClick={copySms} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                    <Copy size={13} /> Copy
                  </button>
                </div>
                {smsLengthInfo && <p className="mb-2 text-xs text-slate-500">{smsLengthInfo.characters} characters · approximately {smsLengthInfo.segments} SMS segment{smsLengthInfo.segments === 1 ? "" : "s"} ({smsLengthInfo.encoding}; carrier/app limits may differ)</p>}
                <pre className="whitespace-pre-wrap break-words text-xs text-slate-800">{smsDraft}</pre>
              </div>
            )}
          </GlassCard>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {!emergencyOpen ? (
            <GlassCard className="text-center">
              <SOSButton
                onActivate={activate}
                onStart={startSOSCountdown}
                onCancel={cancelSOSCountdown}
                status={submissionStatus}
                disabled={sending}
              />

              <div className="mt-6 space-y-5 text-left">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">What do you need? (optional)</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(NEED_LABELS).map(([k, l]) => (
                      <button key={k} onClick={() => toggleNeed(k)}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                          needs.includes(k)
                            ? "border-ark-coral bg-ark-coral/20 text-ark-coral shadow-glow-coral"
                            : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                        }`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                  <span className="text-sm text-slate-300">People with you</span>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setPeopleCount((c) => Math.max(1, c - 1))} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20"><Minus size={16} /></button>
                    <span className="w-6 text-center font-display text-lg font-bold">{peopleCount}</span>
                    <button onClick={() => setPeopleCount((c) => Math.min(50, c + 1))} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20"><Plus size={16} /></button>
                  </div>
                </div>

                <textarea rows={2} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder="Short message for responders (optional)" className="input-glass resize-none" />
              </div>
            </GlassCard>
          ) : phase !== "idle" ? (
            <ActiveSOSCard phase={phase} sos={active} queued={queued} online={online && backendStatus !== "unavailable"} onResolve={resolve} />
          ) : (
            <GlassCard className="border-ark-coral/50">
              <p className="font-semibold text-ark-coral">{submissionError ? "SOS was not recorded" : "Preparing your SOS incident…"}</p>
              <p className="mt-2 text-sm text-slate-600">
                {submissionError ? "Review the error above. This incident is not pending for automatic transmission." : "The incident is being saved on this device before network submission."}
              </p>
              {submissionError && (
                <button
                  onClick={() => {
                    setStartedLocal(false);
                    localIncidentRef.current = null;
                    submissionStartedRef.current = false;
                    sosAttemptRef.current = false;
                    setSubmissionError("");
                    setSubmissionStatus("");
                  }}
                  className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
                >
                  Return to SOS activation
                </button>
              )}
            </GlassCard>
          )}

          <SOSHistory items={mine} />
        </div>

        {medical && <MedicalForm initial={medical} onSave={saveMedical} />}
      </div>
    </div>
  );
}