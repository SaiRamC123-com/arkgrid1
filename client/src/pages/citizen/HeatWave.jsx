import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Popup, Rectangle, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { Activity, AlertTriangle, Crosshair, Droplets, MapPin, RefreshCw, Thermometer, Wind } from "lucide-react";
import api from "../../services/api";
import { getHeatGrid } from "../../services/weatherService";
import { HEAT_INDEX_BANDS_C, heatIndexC } from "../../utils/heatIndex";
import { DarkTiles, youIcon } from "../../components/map/Mapkit";

const REFRESH_MS = 10 * 60 * 1000;
const DEFAULT_CENTER = [20.5937, 78.9629];
const LEVELS = [
  { key: "lower", label: "Below NWS caution", color: "#16a34a" },
  { key: "warm", label: "NWS caution", color: "#eab308" },
  { key: "high", label: "NWS extreme caution", color: "#f97316" },
  { key: "veryHigh", label: "NWS danger", color: "#dc2626" },
  { key: "extreme", label: "NWS extreme danger", color: "#9f1239" },
];

function levelFor(value) {
  if (!Number.isFinite(value)) return null;
  if (value >= HEAT_INDEX_BANDS_C.extremeDanger) return LEVELS[4];
  if (value >= HEAT_INDEX_BANDS_C.danger) return LEVELS[3];
  if (value >= HEAT_INDEX_BANDS_C.extremeCaution) return LEVELS[2];
  if (value >= HEAT_INDEX_BANDS_C.caution) return LEVELS[1];
  return LEVELS[0];
}

function convertTemp(value, fahrenheit, missing = "Unavailable") {
  if (value == null || !Number.isFinite(value)) return missing;
  const converted = fahrenheit ? (value * 9) / 5 + 32 : value;
  return `${converted.toFixed(1)}°${fahrenheit ? "F" : "C"}`;
}

function formatTime(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function MapFocus({ location, selectedPoint }) {
  const map = useMap();
  useEffect(() => {
    const focus = selectedPoint || location;
    if (focus) map.flyTo([focus.latitude, focus.longitude], Math.max(7, map.getZoom()), { duration: 0.4 });
  }, [map, location, selectedPoint]);
  return null;
}

function MapLocationPicker({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

function metricCard(title, value, sub, Icon, tone = "blue") {
  const styles = {
    blue: "text-blue-600 bg-blue-50",
    cyan: "text-cyan-700 bg-cyan-50",
    orange: "text-orange-700 bg-orange-50",
    red: "text-red-700 bg-red-50",
    slate: "text-slate-600 bg-slate-100",
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <span className={`rounded-xl p-2 ${styles[tone]}`}><Icon size={17} /></span>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </article>
  );
}

export default function HeatWave() {
  const [location, setLocation] = useState(null);
  const [grid, setGrid] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [fahrenheit, setFahrenheit] = useState(false);
  const [coordsDraft, setCoordsDraft] = useState({ latitude: "", longitude: "" });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [requestFailed, setRequestFailed] = useState(false);
  const [locationError, setLocationError] = useState("");
  const requestRef = useRef(null);
  const gridRef = useRef(grid);
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);

  const locationKey = location ? `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}:${radiusKm}` : "";
  const gridMatchesLocation = grid?.key === locationKey;
  const points = gridMatchesLocation ? grid.data.points : [];
  const center = points.find((point) => point.row === 0 && point.col === 0) || null;
  const displayedPoint = selectedPoint && points.includes(selectedPoint) ? selectedPoint : center;

  const load = useCallback(async (force = false) => {
    if (!location) {
      setError("Select a location on the map, enter coordinates, or use your device location to request weather.");
      return;
    }
    const key = `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}:${radiusKm}`;
    if (requestRef.current?.key === key) return requestRef.current.promise;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    const request = { key, controller, promise: null };
    requestRef.current = request;
    setError("");
    const hasCurrentGrid = gridRef.current?.key === key;
    setLoading(!hasCurrentGrid);
    setRefreshing(hasCurrentGrid);
    setRequestFailed(false);
    request.promise = (async () => {
      try {
        if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90
          || !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
          throw new Error("The selected location has invalid latitude or longitude coordinates.");
        }
        const data = await getHeatGrid({
          latitude: location.latitude,
          longitude: location.longitude,
          radiusKm,
          refresh: force,
          signal: controller.signal,
        });
        if (!Array.isArray(data?.points) || !data?.center || !data?.retrievedAt) {
          throw new Error("Weather service returned an incomplete response.");
        }
        if (!Number.isFinite(data.center.temperatureC)) {
          throw new Error("Weather response does not include air temperature for the selected location.");
        }
        setGrid({ key, data });
        setSelectedPoint(null);
        setRequestFailed(false);
        setError(data.warning || "");
      } catch (err) {
        if (!controller.signal.aborted) {
          setRequestFailed(true);
          const apiOrigin = api.defaults.baseURL || window.location.origin;
          const status = err.response?.status;
          console.error("[heat-wave] Weather request failed", {
            endpoint: "/api/weather/heat-grid",
            apiOrigin,
            status: status || null,
            code: err.code || null,
            message: err.response?.data?.message || err.message,
          });
          const message = err.providerFallbackError
            ? err.message
            : status === 404
              ? `The configured ArkGrid API (${apiOrigin}) does not have /api/weather/heat-grid deployed; direct Open-Meteo fallback could not be used.`
            : status === 400
              ? err.response?.data?.message || "The weather API rejected the selected coordinates or radius."
              : status === 502
                ? err.response?.data?.message || "The ArkGrid API could not get valid weather data from Open-Meteo."
                : !err.response
                  ? `Could not reach the ArkGrid API at ${apiOrigin}. Check VITE_API_URL, that the API is running, network access, and production CORS configuration.`
                  : err.response?.data?.message || err.message || "Weather data could not be loaded.";
          setError(message);
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
  }, [location, radiusKm]);

  useEffect(() => {
    if (!location) return undefined;
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (requestRef.current?.key === `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}:${radiusKm}`) {
        requestRef.current.controller.abort();
        requestRef.current = null;
      }
    };
  }, [load, location, radiusKm]);

  const chooseLocation = (point) => {
    setLocation(point);
    setCoordsDraft({ latitude: point.latitude.toFixed(4), longitude: point.longitude.toFixed(4) });
    setSelectedPoint(null);
    setLocationError("");
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser. Select a point on the map or enter coordinates.");
      return;
    }
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => chooseLocation({ latitude: coords.latitude, longitude: coords.longitude }),
      (geoError) => {
        const messages = {
          1: "Location permission was denied. Select a point on the map or enter coordinates instead.",
          2: "Your current location is unavailable. Try again or select a point on the map.",
          3: "Location request timed out. Try again or select a point on the map.",
        };
        setLocationError(messages[geoError.code] || "Could not determine your location.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  const submitCoordinates = (event) => {
    event.preventDefault();
    const latitude = Number(coordsDraft.latitude);
    const longitude = Number(coordsDraft.longitude);
    if (!Number.isFinite(latitude) || latitude < -85 || latitude > 85 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setLocationError("Enter a valid latitude (-85 to 85) and longitude (-180 to 180).");
      return;
    }
    chooseLocation({ latitude, longitude });
  };

  const perceivedC = displayedPoint
    ? heatIndexC(displayedPoint.temperatureC, displayedPoint.humidityPct)
    : null;
  const heatLevel = perceivedC == null ? null : levelFor(perceivedC);
  const advice = {
    lower: "Keep water available and follow local weather guidance.",
    warm: "Drink water regularly, take breaks in shade, and check on people more vulnerable to heat.",
    high: "Limit strenuous outdoor activity during the hottest hours. Drink water and use shade or a cool indoor space.",
    veryHigh: "Avoid strenuous outdoor activity where possible. Move to a cool place, hydrate, and check on children, older adults, and people with health conditions.",
    extreme: "Treat heat exposure seriously. Stay in a cool indoor place if possible, avoid exertion, hydrate, and contact local emergency or health services if someone shows signs of heat illness.",
  };

  const trend = useMemo(() => center?.forecast || [], [center]);
  const stepKm = radiusKm / 2;
  const latHalf = (stepKm / 2) / 111.32;
  const lonHalfFor = (latitude) => (stepKm / 2) / (111.32 * Math.max(0.1, Math.abs(Math.cos((latitude * Math.PI) / 180))));

  const formatCoordinate = (point) => point ? `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}` : "No location selected";
  const noLocationValue = location ? "Unavailable" : "Select a location";
  const dataStatus = !location
    ? "Select a location"
    : loading
      ? "Loading…"
      : refreshing
        ? "Refreshing…"
        : requestFailed
          ? gridMatchesLocation ? "Cached · refresh failed" : "Failed"
          : !gridMatchesLocation
            ? "Unavailable"
            : grid.data.stale
              ? "Cached"
              : "Live";
  const dataStatusDetail = gridMatchesLocation
    ? `Retrieved ${formatTime(grid.data.retrievedAt)} · ${grid.data.source}`
    : !location
      ? "Weather request not started"
      : loading
        ? "Requesting weather data…"
        : requestFailed
          ? "No valid response is available for this location."
          : "No weather response yet";

  return (
    <div className="mx-auto max-w-7xl space-y-5 text-slate-800">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">
            <Thermometer size={14} /> WEATHER MODEL ESTIMATE
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Heat Wave Tracking</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Explore Open-Meteo model-derived current conditions and short-term forecasts. High temperature readings are not official heatwave declarations or government warnings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={useMyLocation} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
            <Crosshair size={16} /> Use my location
          </button>
          <button onClick={() => load(true)} disabled={!location || refreshing || loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh weather"}
          </button>
        </div>
      </header>

      <form onSubmit={submitCoordinates} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <label className="text-xs font-semibold text-slate-600">Latitude
          <input type="number" min="-85" max="85" step="any" value={coordsDraft.latitude} onChange={(e) => setCoordsDraft((draft) => ({ ...draft, latitude: e.target.value }))} placeholder="e.g. 12.9716" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Longitude
          <input type="number" min="-180" max="180" step="any" value={coordsDraft.longitude} onChange={(e) => setCoordsDraft((draft) => ({ ...draft, longitude: e.target.value }))} placeholder="e.g. 77.5946" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Map radius
          <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 sm:w-32">
            {[10, 25, 50].map((radius) => <option value={radius} key={radius}>{radius} km</option>)}
          </select>
        </label>
        <button type="submit" className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-800 hover:bg-blue-100">
          <MapPin size={15} /> Show location
        </button>
      </form>

      {!location && (
        <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          No weather request has been made yet. Choose a location on the map, enter coordinates, or select “Use my location”; the page does not assume or invent your location.
        </p>
      )}
      {locationError && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{locationError}</div>}
      {error && <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}{requestFailed && gridMatchesLocation && grid?.data?.points?.length ? " Existing grid values are retained." : ""}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Weather summary">
        {metricCard("Current temperature", convertTemp(displayedPoint?.temperatureC, fahrenheit, noLocationValue), "Open-Meteo model-derived estimate", Thermometer, "orange")}
        {metricCard("Heat level", heatLevel?.label || (loading ? "Loading…" : noLocationValue), heatLevel ? `NWS heat index ${convertTemp(perceivedC, fahrenheit)}` : "Requires air temperature and humidity", Activity, heatLevel?.key === "extreme" || heatLevel?.key === "veryHigh" ? "red" : heatLevel?.key === "high" ? "orange" : "blue")}
        {metricCard("Humidity", displayedPoint?.humidityPct == null ? noLocationValue : `${Math.round(displayedPoint.humidityPct)}%`, "At the selected grid point", Droplets, "cyan")}
        {metricCard("Today's maximum", convertTemp(displayedPoint?.dailyMaximumC, fahrenheit, noLocationValue), "Daily model forecast, local model day", Wind, "orange")}
        {metricCard("Data status", dataStatus, dataStatusDetail, Activity, requestFailed ? "red" : "slate")}
      </section>

      {displayedPoint && heatLevel && (
        <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-orange-700" size={18} />
            <div>
              <p className="font-semibold">{heatLevel.label} band · estimated heat index {convertTemp(perceivedC, fahrenheit)}</p>
              <p className="mt-1">{advice[heatLevel.key]} Guidance is general and not a substitute for local public-health instructions. <a className="font-semibold underline" href="https://www.cdc.gov/heat-health/about/index.html" target="_blank" rel="noreferrer">CDC heat safety guidance</a>.</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.75fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <MapContainer center={DEFAULT_CENTER} zoom={5} className="h-[420px] w-full sm:h-[570px]" scrollWheelZoom>
            <DarkTiles />
            <MapLocationPicker onSelect={chooseLocation} />
            <MapFocus location={location} selectedPoint={selectedPoint} />
            {location && <Marker position={[location.latitude, location.longitude]} icon={youIcon}><Tooltip>Selected location · {formatCoordinate(location)}</Tooltip></Marker>}
            {points.filter((point) => heatIndexC(point.temperatureC, point.humidityPct) !== null).map((point) => {
              const heatIndex = heatIndexC(point.temperatureC, point.humidityPct);
              const level = levelFor(heatIndex);
              const latHalfCell = latHalf;
              const lonHalfCell = lonHalfFor(point.latitude);
              return (
                <Rectangle
                  key={`${point.row}:${point.col}`}
                  bounds={[
                    [point.latitude - latHalfCell, point.longitude - lonHalfCell],
                    [point.latitude + latHalfCell, point.longitude + lonHalfCell],
                  ]}
                  pathOptions={{ color: level.color, fillColor: level.color, fillOpacity: 0.3, weight: 1 }}
                  eventHandlers={{ click: () => setSelectedPoint(point) }}
                >
                  <Popup>
                    <strong>{level.label}</strong>
                    <br />Temperature {convertTemp(point.temperatureC, fahrenheit)}
                    <br />Heat index {convertTemp(heatIndex, fahrenheit)}
                    <br />Provider apparent temperature {convertTemp(point.apparentTemperatureC, fahrenheit)}
                    <br />Humidity {point.humidityPct == null ? "Unavailable" : `${Math.round(point.humidityPct)}%`}
                    <br />Model time {formatTime(point.modelTime)}
                  </Popup>
                </Rectangle>
              );
            })}
            {points.filter((point) => heatIndexC(point.temperatureC, point.humidityPct) !== null).map((point) => {
              const heatIndex = heatIndexC(point.temperatureC, point.humidityPct);
              const level = levelFor(heatIndex);
              return <CircleMarker key={`dot-${point.row}:${point.col}`} center={[point.latitude, point.longitude]} radius={4} pathOptions={{ color: "#fff", weight: 1, fillColor: level.color, fillOpacity: 1 }} eventHandlers={{ click: () => setSelectedPoint(point) }} />;
            })}
          </MapContainer>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 text-xs text-slate-600">
            {LEVELS.map((level) => <span key={level.key} className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: level.color }} />{level.label}</span>)}
          </div>
          <p className="px-3 pb-3 text-xs leading-5 text-slate-500">Each colored square represents one of 9 sampled forecast points; it is a coarse visualization, not a continuous measurement or an official heat-warning map. Click the map to select a different point. Map tiles and weather updates require internet access.</p>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">Selected point</h2>
                <p className="mt-1 text-xs text-slate-500">{formatCoordinate(displayedPoint)}</p>
              </div>
              <button type="button" onClick={() => setFahrenheit((value) => !value)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">°{fahrenheit ? "F" : "C"} · switch</button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">Air temperature</dt><dd className="mt-1 font-semibold text-slate-900">{convertTemp(displayedPoint?.temperatureC, fahrenheit)}</dd></div>
              <div><dt className="text-xs text-slate-500">Apparent temperature</dt><dd className="mt-1 font-semibold text-slate-900">{convertTemp(displayedPoint?.apparentTemperatureC, fahrenheit)}</dd></div>
              <div><dt className="text-xs text-slate-500">Model time</dt><dd className="mt-1 font-medium text-slate-800">{displayedPoint ? formatTime(displayedPoint.modelTime) : "Unavailable"}</dd></div>
              <div><dt className="text-xs text-slate-500">Last successful retrieval</dt><dd className="mt-1 font-medium text-slate-800">{gridMatchesLocation ? formatTime(grid.data.retrievedAt) : "Unavailable"}</dd></div>
            </dl>
            {displayedPoint && <p className="mt-3 text-xs text-slate-500">{grid.data.source} · {grid.data.stale ? "Stale cached result" : "Current cached/fresh response"}</p>}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-900">Coming hours</h2>
            <p className="mt-1 text-xs text-slate-500">Model forecast for the selected location.</p>
            {trend.length ? (
              <div className="mt-4 grid grid-cols-4 gap-2">
                {trend.slice(0, 8).map((entry) => {
                  const forecastHeatIndex = heatIndexC(entry.temperatureC, entry.humidityPct);
                  const level = levelFor(forecastHeatIndex);
                  return (
                    <div key={entry.time} className="rounded-lg bg-slate-50 p-2 text-center">
                      <p className="text-[10px] text-slate-500">{new Date(entry.time).toLocaleTimeString([], { hour: "2-digit" })}</p>
                      <div className="mx-auto my-2 h-1.5 rounded-full" style={{ backgroundColor: level?.color || "#cbd5e1", width: `${Math.max(20, Math.min(100, (entry.temperatureC / 50) * 100))}%` }} />
                      <p className="text-xs font-semibold text-slate-800">{convertTemp(entry.temperatureC, fahrenheit)}</p>
                    </div>
                  );
                })}
              </div>
            ) : <p className="mt-4 text-sm text-slate-500">{loading ? "Loading forecast…" : "Forecast unavailable until a location is selected."}</p>}
          </div>

          <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">Heat-index method and bands</summary>
            <p className="mt-2 text-xs leading-5 text-slate-500">Heat index is estimated from air temperature and relative humidity using the <a className="font-semibold underline" href="https://www.weather.gov/safety/heat-index" target="_blank" rel="noreferrer">U.S. National Weather Service equation</a>. Bands follow NWS guidance: caution 80–90°F, extreme caution 90–103°F, danger 103–125°F, and extreme danger at or above 125°F. This estimate is not an official local alert.</p>
          </details>
        </aside>
      </section>

      <footer className="space-y-1 text-xs leading-5 text-slate-500">
        <p>{gridMatchesLocation ? grid.data.attribution : "Open-Meteo forecast data will be shown after you select a location."} Each weather field is displayed independently; missing apparent temperature, humidity, or daily values do not hide available measurements.</p>
        <p>Heat-index bands follow NWS guidance but are estimates, not an official heatwave warning. No official local alert provider is connected. Open-Meteo data are weather-model output and are not on-site sensor readings.</p>
      </footer>
    </div>
  );
}
