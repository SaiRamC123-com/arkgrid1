import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import { Activity, AlertTriangle, Crosshair, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { DarkTiles, youIcon } from "../../components/map/Mapkit";
import { getEarthquakes, getGlobalHazards } from "../../services/observations";
import { getHeatGrid } from "../../services/weatherService";
import { distanceKm, isObservationInWindow, makeWeatherObservations } from "../../utils/observationData";

const HOURS = [
  { value: 24, label: "Past 24 hours" },
  { value: 168, label: "Past 7 days" },
  { value: 720, label: "Past 30 days" },
];
const MAGNITUDES = [
  { value: 0, label: "All magnitudes" },
  { value: 2.5, label: "M 2.5+" },
  { value: 4, label: "M 4.0+" },
  { value: 5, label: "M 5.0+" },
];
const REFRESH_MS = Number(import.meta.env.VITE_OBSERVATIONS_REFRESH_MS) >= 60000
  ? Number(import.meta.env.VITE_OBSERVATIONS_REFRESH_MS)
  : 5 * 60 * 1000;

function magnitudeIcon(magnitude) {
  const mag = Number.isFinite(magnitude) ? magnitude : 0;
  const color = mag >= 6 ? "#fb7185" : mag >= 4 ? "#fbbf24" : "#22d3ee";
  const size = Math.min(42, Math.max(24, 24 + mag * 2));
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border:2px solid white;border-radius:50%;background:${color};color:#07101f;font:700 11px sans-serif;box-shadow:0 0 12px ${color}">${mag.toFixed(1)}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FocusMap({ selected, location }) {
  const map = useMap();
  useEffect(() => {
    const point = selected
      ? [selected.latitude, selected.longitude]
      : location
        ? [location.latitude, location.longitude]
        : null;
    if (point) map.flyTo(point, Math.max(map.getZoom(), 5), { duration: 0.5 });
  }, [map, selected, location]);
  return null;
}

function eventDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "Time unavailable";
}

function ageLabel(value, now = Date.now()) {
  if (!value || !Number.isFinite(Date.parse(value))) return "age unavailable";
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hr ago`;
}

function eventIcon(event) {
  if (event.hazardType === "earthquake") return magnitudeIcon(event.magnitude);
  const severity = String(event.severity || "").toLowerCase();
  const color = severity === "red" ? "#fb7185" : severity === "orange" ? "#fbbf24" : event.hazardType === "weather" ? "#38bdf8" : "#22d3ee";
  const label = event.hazardType === "flood" ? "FL" : event.hazardType === "cyclone" ? "TC" : "WX";
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:2px solid white;border-radius:50%;background:${color};color:#07101f;font:700 10px sans-serif;box-shadow:0 0 10px ${color}">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function LiveObservations() {
  const [hours, setHours] = useState(24);
  const [minMagnitude, setMinMagnitude] = useState(0);
  const [eventType, setEventType] = useState("all");
  const [distanceLimitKm, setDistanceLimitKm] = useState(0);
  const [events, setEvents] = useState([]);
  const [hazards, setHazards] = useState([]);
  const [hazardRetrievedAt, setHazardRetrievedAt] = useState(null);
  const [hazardSource, setHazardSource] = useState("GDACS global flood and tropical cyclone alerts");
  const [hazardStale, setHazardStale] = useState(false);
  const [hazardError, setHazardError] = useState("");
  const [weatherGrid, setWeatherGrid] = useState(null);
  const [weatherRetrievedAt, setWeatherRetrievedAt] = useState(null);
  const [weatherError, setWeatherError] = useState("");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherRefreshNonce, setWeatherRefreshNonce] = useState(0);
  const [selected, setSelected] = useState(null);
  const [location, setLocation] = useState(null);
  const [retrievedAt, setRetrievedAt] = useState(null);
  const [source, setSource] = useState("USGS Earthquake Hazards Program");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(null);
  const hasLoadedRef = useRef(false);
  const hazardRetrievedRef = useRef(false);
  useEffect(() => { hazardRetrievedRef.current = Boolean(hazardRetrievedAt); }, [hazardRetrievedAt]);

  const refresh = useCallback((force = false) => {
    const key = `${hours}:${minMagnitude}`;
    if (requestRef.current?.key === key) return requestRef.current.promise;
    requestRef.current?.controller.abort();

    const controller = new AbortController();
    const request = { key, controller, promise: null };
    requestRef.current = request;
    setError("");
    setLoading(!hasLoadedRef.current);
    setRefreshing(hasLoadedRef.current);
    request.promise = (async () => {
      try {
        const [earthquakeResult, hazardResult] = await Promise.allSettled([
          getEarthquakes({ hours, minMagnitude, refresh: force, signal: controller.signal }),
          getGlobalHazards({ hours, refresh: force, signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if (earthquakeResult.status === "fulfilled"
          && Array.isArray(earthquakeResult.value?.events)
          && earthquakeResult.value.retrievedAt) {
          const data = earthquakeResult.value;
          setEvents(data.events);
          setRetrievedAt(data.retrievedAt);
          setSource(data.source || "USGS Earthquake Hazards Program");
          setStale(Boolean(data.stale));
          setError(data.warning || "");
          hasLoadedRef.current = true;
        } else {
          const reason = earthquakeResult.status === "rejected"
            ? earthquakeResult.reason
            : new Error("USGS returned an invalid earthquake response.");
          setStale(hasLoadedRef.current);
          setError(reason.response?.data?.message || reason.message || "Could not refresh USGS earthquakes.");
        }
        if (hazardResult.status === "fulfilled"
          && Array.isArray(hazardResult.value?.events)
          && hazardResult.value.retrievedAt) {
          const data = hazardResult.value;
          setHazards(data.events);
          setHazardRetrievedAt(data.retrievedAt);
          setHazardSource(data.source || "GDACS");
          setHazardStale(Boolean(data.stale));
          setHazardError(data.warning || "");
        } else {
          const reason = hazardResult.status === "rejected"
            ? hazardResult.reason
            : new Error("GDACS returned an invalid hazard response.");
          setHazardStale(hazardRetrievedRef.current);
          setHazardError(reason.response?.data?.message || reason.message || "GDACS flood and cyclone alerts are unavailable.");
        }
      } finally {
        if (requestRef.current === request) {
          requestRef.current = null;
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return request.promise;
  }, [hours, minMagnitude]);

  useEffect(() => {
    if (!location) return undefined;
    const controller = new AbortController();
    const locationKey = `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`;
    setWeatherLoading(true);
    setWeatherError("");
    getHeatGrid({
      latitude: location.latitude,
      longitude: location.longitude,
      radiusKm: 25,
      refresh: weatherRefreshNonce > 0,
      signal: controller.signal,
    }).then((data) => {
      if (!Array.isArray(data?.points) || !data.retrievedAt) {
        throw new Error("Open-Meteo returned an invalid weather grid.");
      }
      setWeatherGrid({ key: locationKey, data });
      setWeatherRetrievedAt(data.retrievedAt);
    }).catch((err) => {
      if (!controller.signal.aborted) {
        setWeatherError(err.response?.data?.message || err.message || "Open-Meteo weather conditions are unavailable.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setWeatherLoading(false);
    });
    return () => controller.abort();
  }, [location, weatherRefreshNonce]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      requestRef.current?.controller.abort();
      requestRef.current = null;
    };
  }, [refresh]);

  const types = useMemo(
    () => [...new Set(events.map((event) => event.eventType).filter(Boolean))].sort(),
    [events]
  );
  const locationKey = location ? `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}` : "";
  const weatherEvents = useMemo(() => (
    weatherGrid?.key === locationKey ? makeWeatherObservations(weatherGrid.data.points) : []
  ), [locationKey, weatherGrid]);
  const sourceTimes = [retrievedAt, hazardRetrievedAt, weatherRetrievedAt]
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  const windowEnd = sourceTimes.length ? Math.max(...sourceTimes) : Number.NaN;
  const allEvents = useMemo(() => [
    ...events.map((event) => ({ ...event, hazardType: "earthquake", source: event.source || source })),
    ...hazards,
    ...weatherEvents,
  ], [events, hazards, source, weatherEvents]);
  const visibleEvents = useMemo(() => allEvents.filter((event) => {
    if (eventType === "earthquake" && event.hazardType !== "earthquake") return false;
    if (eventType === "flood" && event.hazardType !== "flood") return false;
    if (eventType === "cyclone" && event.hazardType !== "cyclone") return false;
    if (eventType === "weather" && event.hazardType !== "weather") return false;
    if (eventType.startsWith("usgs:") && (event.hazardType !== "earthquake" || event.eventType !== eventType.slice(5))) return false;
    if (!isObservationInWindow(event, hours, windowEnd)) return false;
    if (distanceLimitKm && location && distanceKm(location, event) > distanceLimitKm) return false;
    return true;
  }), [allEvents, distanceLimitKm, eventType, hours, location, windowEnd]);

  const locate = () => {
    if (!navigator.geolocation) {
      setError("Location is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setError("");
      },
      (geoError) => {
        const message = geoError.code === geoError.PERMISSION_DENIED
          ? "Location permission was denied. You can still explore all observations."
          : "Could not get your location. Check the device location setting and try again.";
        setError(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const chooseEvent = (event) => setSelected(event);
  const refreshAll = () => {
    void refresh(true);
    if (location) setWeatherRefreshNonce((value) => value + 1);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-ark-cyan/30 bg-ark-cyan/10 px-3 py-1 text-xs font-semibold text-ark-cyan">
            <Activity size={14} /> LIVE SOURCES · USGS · GDACS · OPEN-METEO
          </div>
          <h1 className="font-display text-3xl font-bold">Live <span className="text-gradient">Observations</span></h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            USGS earthquake reports and GDACS flood/cyclone alerts are shown separately from Open-Meteo model weather estimates. Weather forecasts are not confirmed disasters; no unsupported hazard or warning zones are inferred.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={locate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-slate-200 hover:bg-white/5">
            <Crosshair size={16} /> Use my location
          </button>
          <button onClick={refreshAll} disabled={refreshing || loading || weatherLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ark-indigo to-ark-cyan px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">
            {refreshing || loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {refreshing ? "Refreshing…" : loading ? "Loading…" : "Refresh Observations"}
          </button>
        </div>
      </header>

      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-xs ${stale ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>
        <span>{stale ? "STALE" : "USGS"} · {source} · {retrievedAt ? `Retrieved ${eventDate(retrievedAt)} (${ageLabel(retrievedAt)})` : "Waiting for source"}</span>
        <span>{hazardStale ? "STALE GDACS" : "GDACS"} · {hazardSource} · {hazardRetrievedAt ? `Retrieved ${eventDate(hazardRetrievedAt)} (${ageLabel(hazardRetrievedAt)})` : hazardError ? "Unavailable" : "Loading"}</span>
        <span>Weather model · {weatherRetrievedAt ? `Retrieved ${eventDate(weatherRetrievedAt)} (${ageLabel(weatherRetrievedAt)})` : weatherLoading ? "Loading after choosing a location" : "Choose a location"} · Auto-refresh {Math.round(REFRESH_MS / 60000)} min</span>
      </div>

      {error && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" /> {error}
          {stale && events.length > 0 && " Existing observations are retained."}
        </div>
      )}
      {hazardError && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" /> GDACS flood and tropical-cyclone alerts unavailable: {hazardError}
          {hazardStale && hazards.length > 0 && " Previously retrieved alerts are retained and labeled with their original status and time."}
        </div>
      )}
      {weatherError && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" /> Open-Meteo model weather is unavailable: {weatherError}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(350px,0.9fr)]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2">
          <MapContainer center={[20, 0]} zoom={2} className="h-[420px] w-full sm:h-[620px]" scrollWheelZoom>
            <DarkTiles />
            <FocusMap selected={selected} location={location} />
            {location && (
              <Marker position={[location.latitude, location.longitude]} icon={youIcon} zIndexOffset={1000}>
                <Tooltip direction="top">Your device location · not a disaster observation</Tooltip>
              </Marker>
            )}
            {visibleEvents.map((event) => (
              <Marker key={event.id} position={[event.latitude, event.longitude]} icon={eventIcon(event)} eventHandlers={{ click: () => chooseEvent(event) }}>
                <Popup>
                  <strong>{event.magnitude == null ? event.title : `M ${event.magnitude.toFixed(1)}`}</strong>
                  <br />{event.location}
                  <br />Type: {event.hazardType === "earthquake" ? `Earthquake (${event.eventType})` : event.hazardType}
                  <br />Time: {eventDate(event.time)}
                  {event.severity && <><br />Alert level: {event.severity}</>}
                  {event.precipitationMm != null && <><br />Model precipitation: {event.precipitationMm} mm</>}
                  {event.windSpeedKmh != null && <><br />Model wind: {event.windSpeedKmh} km/h</>}
                  <br />{event.status}
                  <br />Source: {event.source}
                  {event.url && <><br /><a href={event.url} target="_blank" rel="noreferrer">Source details</a></>}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <div className="flex flex-wrap gap-4 px-3 py-3 text-xs text-slate-400">
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-ark-cyan" /> USGS earthquake</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-400" /> GDACS flood/cyclone alerts</span>
            {weatherEvents.length > 0 && <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-sky-400" /> Open-Meteo model conditions, not alerts</span>}
            {location && <span className="text-blue-300">Blue marker: your location (not an event)</span>}
          </div>
          <p className="px-3 pb-3 text-xs text-slate-500">Map tiles and observation refresh require an internet connection.</p>
        </div>

        <aside className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="grid gap-3 border-b border-white/10 p-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <label className="text-xs text-slate-400">Time window
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="input-glass mt-1">
                {HOURS.map((option) => <option key={option.value} value={option.value} className="bg-navy-900">{option.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">Minimum earthquake magnitude
              <select value={minMagnitude} onChange={(e) => setMinMagnitude(Number(e.target.value))} className="input-glass mt-1">
                {MAGNITUDES.map((option) => <option key={option.value} value={option.value} className="bg-navy-900">{option.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">Hazard / condition
              <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="input-glass mt-1">
                <option value="all" className="bg-navy-900">All supported sources</option>
                <option value="earthquake" className="bg-navy-900">Earthquakes (USGS)</option>
                <option value="flood" className="bg-navy-900">Flood alerts (GDACS)</option>
                <option value="cyclone" className="bg-navy-900">Cyclone alerts (GDACS)</option>
                <option value="weather" className="bg-navy-900">Weather model conditions</option>
                {types.map((type) => <option key={type} value={`usgs:${type}`} className="bg-navy-900">USGS event: {type}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">Distance from selected location
              <select value={distanceLimitKm} onChange={(e) => setDistanceLimitKm(Number(e.target.value))} disabled={!location} className="input-glass mt-1 disabled:opacity-50">
                <option value={0} className="bg-navy-900">All locations</option>
                {[100, 500, 1000, 2500].map((distance) => <option key={distance} value={distance} className="bg-navy-900">Within {distance} km</option>)}
              </select>
            </label>
          </div>

          {selected && (
            <div className="border-b border-ark-cyan/20 bg-ark-cyan/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ark-cyan">Selected {selected.hazardType || "earthquake"}</p>
                  <h2 className="mt-1 font-semibold text-white">{selected.magnitude == null ? selected.title : `Magnitude ${selected.magnitude.toFixed(1)}`}</h2>
                  <p className="mt-1 text-sm text-slate-300">{selected.location}</p>
                </div>
                <button onClick={() => setSelected(null)} aria-label="Clear selected event" className="text-xs text-slate-400 hover:text-white">Clear</button>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {eventDate(selected.time)} · {selected.latitude.toFixed(3)}, {selected.longitude.toFixed(3)}
                {selected.depthKm != null ? ` · ${selected.depthKm.toFixed(1)} km depth` : ""}
                {selected.severity ? ` · GDACS alert: ${selected.severity}` : ""}
                {selected.updated ? ` · Updated ${eventDate(selected.updated)}` : ""}
                {selected.status ? ` · ${selected.status}` : ""}
                {selected.hazardType === "weather" && selected.precipitationMm != null ? ` · ${selected.precipitationMm} mm model precipitation` : ""}
                {selected.hazardType === "weather" && selected.windSpeedKmh != null ? ` · ${selected.windSpeedKmh} km/h model wind` : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">Source: {selected.source}</p>
              {selected.url && <a href={selected.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ark-cyan hover:underline">Source details <ExternalLink size={13} /></a>}
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-semibold text-white">Live alerts and conditions</h2>
            <span className="text-xs text-slate-400">{visibleEvents.length} items</span>
          </div>
          <div className="max-h-[440px] flex-1 divide-y divide-white/5 overflow-y-auto">
            {loading && events.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading observation feeds…</div>
            ) : visibleEvents.length === 0 ? (
              <p className="px-4 py-8 text-sm text-slate-400">{eventType === "weather" && !location ? "Choose your location to load nearby Open-Meteo weather model conditions." : "No events match these filters, or the selected provider is unavailable. Try a wider time window, lower earthquake magnitude, or a different distance."}</p>
            ) : visibleEvents.map((event) => (
              <button key={event.id} onClick={() => chooseEvent(event)} className={`block w-full px-4 py-3 text-left hover:bg-white/[0.04] ${selected?.id === event.id ? "bg-white/[0.05]" : ""}`}>
                <span className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold text-white">{event.magnitude == null ? event.title : `M ${event.magnitude.toFixed(1)}`} <span className="font-normal text-slate-300">· {event.location}</span></span>
                  <span className="shrink-0 text-[11px] text-slate-500">{event.time ? new Date(event.time).toLocaleDateString() : "Time unavailable"}</span>
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {event.time ? new Date(event.time).toLocaleTimeString() : "Time unavailable"} · {event.latitude.toFixed(2)}, {event.longitude.toFixed(2)}
                  {event.depthKm != null ? ` · ${event.depthKm.toFixed(1)} km` : ""}
                  {event.severity ? ` · GDACS ${event.severity}` : ""}
                  {event.hazardType === "weather" && event.precipitationMm != null ? ` · ${event.precipitationMm} mm precipitation (model)` : ""}
                  {event.status ? ` · ${event.status}` : ""}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>
      <p className="text-xs leading-5 text-slate-500">
        USGS supplies observed earthquake event reports; GDACS supplies recent/ongoing flood and tropical-cyclone alerts with provider alert levels. Open-Meteo values are weather-model estimates only and are not confirmed heavy-rain incidents, floods, severe-weather warnings, or high-risk zones. No live landslide or heatwave incident feed is connected. Follow local official emergency alerts.
      </p>
    </div>
  );
}
