import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Crosshair, ExternalLink, MapPin, Navigation, RefreshCw, ShieldAlert } from "lucide-react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { shelterApi } from "../../services/shelterService";
import { roadApi } from "../../services/roadService";
import { distanceM, fmtDistance, routeHazards } from "../../utils/geo";
import { fetchRoute, fmtDuration } from "../../utils/routing";
import { HAZARD_COLORS, HISTORICAL_INCIDENTS, DEMO_INCIDENTS, filterIncidents } from "../../data/disasterHistory";
import DisasterHistoryMap from "../../components/incidents/DisasterHistoryMap";
import GlassCard from "../../components/ui/GlassCard";

const USGS_REFRESH_MS = 5 * 60 * 1000;
const fmtDate = (value) => {
  if (!value) return "Not reported";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(value).toLocaleString();
};

function validLocation(lat, lng) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

function liveRecord(event, stale) {
  return {
    id: `live-${event.id}`,
    hazardType: "earthquake",
    title: event.location || "USGS earthquake",
    eventAt: event.time,
    latitude: event.latitude,
    longitude: event.longitude,
    location: event.location || "Location not reported",
    precision: "USGS event coordinates",
    region: event.location || "",
    magnitude: event.magnitude,
    depthKm: event.depthKm,
    description: event.alert ? `USGS alert level: ${event.alert}.` : "Recent earthquake from the live USGS feed.",
    affectedRegions: [],
    sourceName: "USGS Earthquake Hazards Program",
    sourceUrl: event.url,
    relatedSources: [],
    sourceUpdatedAt: event.updated,
    status: stale ? "STALE LIVE DATA" : "LIVE",
    confidence: event.status || "USGS feed record",
    lastUpdatedAt: null,
    demo: false,
  };
}

function DetailRecord({ record }) {
  return (
    <article className="space-y-3 border-t border-slate-200 pt-4 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{record.title}</h3>
          <p className="mt-1 text-xs text-slate-600">{record.location} · {record.precision}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
          record.demo ? "bg-violet-100 text-violet-800"
            : record.status === "LIVE" ? "bg-emerald-100 text-emerald-800"
              : record.status === "STALE LIVE DATA" ? "bg-amber-100 text-amber-900"
                : "bg-slate-100 text-slate-700"
        }`}>{record.status}</span>
      </div>
      <p className="text-sm leading-6 text-slate-700">{record.description}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div><dt className="text-slate-500">Event time</dt><dd className="mt-0.5 font-medium text-slate-800">{fmtDate(record.eventAt)}</dd></div>
        <div><dt className="text-slate-500">Region</dt><dd className="mt-0.5 font-medium text-slate-800">{record.region}</dd></div>
        <div><dt className="text-slate-500">Magnitude</dt><dd className="mt-0.5 font-medium text-slate-800">{record.magnitude == null ? "Not reported" : `M ${record.magnitude}`}</dd></div>
        <div><dt className="text-slate-500">Depth</dt><dd className="mt-0.5 font-medium text-slate-800">{record.depthKm == null ? "Not reported" : `${record.depthKm} km`}</dd></div>
        <div><dt className="text-slate-500">Source update time</dt><dd className="mt-0.5 font-medium text-slate-800">{fmtDate(record.sourceUpdatedAt)}</dd></div>
        <div><dt className="text-slate-500">Record updated</dt><dd className="mt-0.5 font-medium text-slate-800">{fmtDate(record.lastUpdatedAt)}</dd></div>
      </dl>
      {record.affectedRegions.length > 0 && (
        <p className="text-xs text-slate-600"><b>Affected regions:</b> {record.affectedRegions.join(", ")}</p>
      )}
      <p className="text-xs text-slate-600"><b>Confidence:</b> {record.confidence}</p>
      <div className="flex flex-wrap gap-3">
        {record.sourceUrl && (
          <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline">
            <ExternalLink size={13} /> {record.sourceName}
          </a>
        )}
        {record.relatedSources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline">
            <ExternalLink size={13} /> {source.name}
          </a>
        ))}
      </div>
      {record.hazardType === "earthquake" && (
        <a href="https://www.ready.gov/earthquakes" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline">
          <ExternalLink size={13} /> Ready.gov earthquake preparedness guidance
        </a>
      )}
      {(record.hazardType === "flood" || record.secondaryHazards?.includes("landslide")) && (
        <div className="flex flex-wrap gap-3">
          {record.hazardType === "flood" && (
            <a href="https://www.ready.gov/floods" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline">
              <ExternalLink size={13} /> Ready.gov flood safety
            </a>
          )}
          {record.secondaryHazards?.includes("landslide") && (
            <a href="https://www.ready.gov/landslides-debris-flow" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline">
              <ExternalLink size={13} /> Ready.gov landslide safety
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function CandidateCard({ candidate, selected, onSelect }) {
  const blocked = candidate.verifiedHazards?.length > 0;
  const routeLabel = blocked ? "Avoid · known hazard" : candidate.route ? "Route found" : "No route";
  return (
    <button type="button" onClick={onSelect} className={`w-full rounded-xl border p-3 text-left ${
      selected ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-slate-900">{candidate.name}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${blocked ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
          {routeLabel}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {candidate.route ? `${fmtDistance(candidate.route.distanceM)} · about ${fmtDuration(candidate.route.durationS)}` : candidate.routeError || "Routing unavailable"}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Straight-line distance {fmtDistance(candidate.distanceM)} · availability {candidate.reportedAvailability}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        ArkGrid-listed shelter · capacity {candidate.capacity > 0 ? "reported, not independently verified" : "not verified"} · last update {fmtDate(candidate.updatedAt)}
      </p>
      {candidate.verifiedHazards?.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700">
          <AlertTriangle size={13} /> Route passes near {candidate.verifiedHazards.length} current verified flooded/blocked road report(s).
        </p>
      )}
      {candidate.unverifiedHazards?.length > 0 && (
        <p className="mt-1 text-xs text-amber-800">
          {candidate.unverifiedHazards.length} unverified road report(s) are near the route.
        </p>
      )}
    </button>
  );
}

export default function DisasterHistory() {
  const { profile } = useAuth();
  const [includeLive, setIncludeLive] = useState(false);
  const [includeDemo, setIncludeDemo] = useState(false);
  const [live, setLive] = useState({ events: [], retrievedAt: null, stale: false, error: "" });
  const [filters, setFilters] = useState({ hazard: "all", startDate: "", endDate: "", region: "", severity: "all" });
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const [origin, setOrigin] = useState(null);
  const [coordsDraft, setCoordsDraft] = useState({ lat: "", lng: "" });
  const [originError, setOriginError] = useState("");
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneError, setZoneError] = useState("");
  const [zoneNotice, setZoneNotice] = useState("");
  const [zoneCandidates, setZoneCandidates] = useState([]);
  const [roadsAvailable, setRoadsAvailable] = useState(false);
  const [selectedDestinationId, setSelectedDestinationId] = useState(null);

  const refreshLive = useCallback(async (force = false) => {
    try {
      const response = await api.get("/api/observations/earthquakes", {
        params: { hours: 720, minMagnitude: 0, ...(force ? { refresh: 1 } : {}) },
        timeout: 15000,
      });
      if (!Array.isArray(response.data?.events) || !response.data.retrievedAt) {
        throw new Error("USGS live feed returned an invalid response.");
      }
      setLive({
        events: response.data.events,
        retrievedAt: response.data.retrievedAt,
        stale: Boolean(response.data.stale),
        error: response.data.warning || "",
      });
    } catch (error) {
      setLive((previous) => ({
        ...previous,
        stale: previous.events.length > 0,
        error: error.response?.data?.message || error.message || "Live USGS data could not be refreshed.",
      }));
    }
  }, []);

  useEffect(() => {
    if (!includeLive) return undefined;
    refreshLive();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshLive();
    }, USGS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [includeLive, refreshLive]);

  const records = useMemo(() => [
    ...HISTORICAL_INCIDENTS,
    ...(includeLive ? live.events.map((event) => liveRecord(event, live.stale)) : []),
    ...(includeDemo ? DEMO_INCIDENTS : []),
  ], [includeDemo, includeLive, live.events, live.stale]);
  const filtered = useMemo(() => filterIncidents(records, { ...filters, includeDemo }), [records, filters, includeDemo]);
  const selectedIds = new Set(selectedRecordIds);
  const selectedRecords = filtered.filter((record) => selectedIds.has(record.id));
  const selectedDestination = zoneCandidates.find((candidate) => candidate.id === selectedDestinationId) || null;
  const visibleRoute = selectedDestination?.route && !selectedDestination.verifiedHazards?.length
    ? selectedDestination.route
    : null;

  const chooseOrigin = (point) => {
    setOrigin(point);
    setCoordsDraft({ lat: point.lat.toFixed(5), lng: point.lng.toFixed(5) });
    setOriginError("");
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setOriginError("Location is not supported. Enter coordinates or click the map.");
      return;
    }
    setOriginError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => chooseOrigin({ lat: coords.latitude, lng: coords.longitude }),
      (error) => setOriginError(error.code === error.PERMISSION_DENIED
        ? "Location permission was denied. Enter coordinates or click the map."
        : "Could not get your location. Enter coordinates or click the map."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  const submitOrigin = (event) => {
    event.preventDefault();
    const lat = Number(coordsDraft.lat);
    const lng = Number(coordsDraft.lng);
    if (!validLocation(lat, lng)) {
      setOriginError("Enter a latitude from -90 to 90 and longitude from -180 to 180.");
      return;
    }
    chooseOrigin({ lat, lng });
  };

  const findSaferZone = async () => {
    if (!profile) {
      setZoneError("Sign in to access ArkGrid shelter and road reports. No destination is guaranteed safe.");
      return;
    }
    if (!origin || !validLocation(origin.lat, origin.lng)) {
      setZoneError("Choose your current location or click the map to set a valid origin first.");
      return;
    }
    setZoneLoading(true);
    setZoneError("");
    setZoneNotice("");
    setZoneCandidates([]);
    setSelectedDestinationId(null);

    const [facilitiesResult, roadsResult] = await Promise.allSettled([
      shelterApi.nearby(origin.lat, origin.lng, undefined, 25000),
      roadApi.list(),
    ]);
    if (facilitiesResult.status === "rejected") {
      setZoneError("Could not retrieve ArkGrid shelter listings. Check your connection and try again.");
      setRoadsAvailable(false);
      setZoneLoading(false);
      return;
    }

    const facilitiesResponse = facilitiesResult.value;
    if (!Array.isArray(facilitiesResponse?.shelters)) {
      setZoneError("ArkGrid returned an invalid shelter listing. Try again later.");
      setRoadsAvailable(false);
      setZoneLoading(false);
      return;
    }
    const roads = roadsResult.status === "fulfilled" && Array.isArray(roadsResult.value) ? roadsResult.value : [];
    const hazardsAvailable = roadsResult.status === "fulfilled" && Array.isArray(roadsResult.value);
    setRoadsAvailable(hazardsAvailable);
    const candidates = facilitiesResponse.shelters
      .filter((facility) => facility.type === "shelter" && facility.source !== "openstreetmap" && !facility.demo && facility.status !== "closed" && validLocation(facility.lat, facility.lng))
      .map((facility) => ({
        ...facility,
        distanceM: distanceM(origin, facility),
        reportedAvailability: facility.capacity > 0 ? facility.availability : "unknown / not verified",
      }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 5);

    if (!candidates.length) {
      setZoneError("No non-demo ArkGrid-listed shelters were found within 25 km. Hospitals and community-map points are not treated as shelters.");
      setZoneLoading(false);
      return;
    }

    const results = await Promise.all(candidates.map(async (candidate) => {
      try {
        const route = await fetchRoute(origin, { lat: candidate.lat, lng: candidate.lng }, "walking");
        const nearbyHazards = hazardsAvailable ? routeHazards(route.coords, roads) : [];
        return {
          ...candidate,
          route,
          routeError: "",
          verifiedHazards: nearbyHazards.filter((road) => road.verified),
          unverifiedHazards: nearbyHazards.filter((road) => !road.verified),
        };
      } catch (error) {
        return { ...candidate, route: null, routeError: error.message || "Routing service unavailable", verifiedHazards: [], unverifiedHazards: [] };
      }
    }));
    results.sort((a, b) => {
      if (a.route && !b.route) return -1;
      if (!a.route && b.route) return 1;
      if (hazardsAvailable && a.verifiedHazards.length !== b.verifiedHazards.length) return a.verifiedHazards.length - b.verifiedHazards.length;
      return (a.route?.durationS ?? Infinity) - (b.route?.durationS ?? Infinity);
    });
    setZoneCandidates(results);
    setSelectedDestinationId(results.find((candidate) => candidate.route && !candidate.verifiedHazards.length)?.id || results[0].id);
    const hasHazardFreeRoute = results.some((candidate) => candidate.route && !candidate.verifiedHazards.length);
    const hasRoute = results.some((candidate) => candidate.route);
    if (!hasRoute) {
      setZoneNotice("No walking route could be retrieved for these shelters. No route is displayed or recommended.");
    } else if (!hazardsAvailable) {
      setZoneNotice("Road hazard data could not be loaded. Routes are shown for comparison only; a safer route cannot be confirmed.");
    } else if (!hasHazardFreeRoute) {
      setZoneNotice("No routed candidate avoids all current verified flooded/blocked reports. Do not treat these paths as passable.");
    } else {
      setZoneNotice("Preferred route means the quickest returned route with no intersecting current verified flooded/blocked report found in ArkGrid. Coverage may be incomplete; this does not confirm safety.");
    }
    if (facilitiesResponse.sourceError) setZoneError(facilitiesResponse.sourceError);
    setZoneLoading(false);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 text-slate-800">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">
            <Activity size={14} /> HISTORICAL + SEPARATE LIVE FEEDS
          </span>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Disaster History &amp; Incident Clusters</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Source-linked historical records are separate from the optional live USGS earthquake feed. Regional markers are approximate and are not flood or damage boundaries.
          </p>
        </div>
        {includeLive && (
          <button type="button" onClick={() => refreshLive(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={15} /> Refresh live USGS
          </button>
        )}
      </header>

      <div className="grid gap-2 sm:grid-cols-3" aria-label="Data classifications">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"><b>HISTORICAL</b> · sourced past events</div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"><b>RECENT REPORT</b> · may be preliminary</div>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
          <input type="checkbox" checked={includeLive} onChange={(event) => setIncludeLive(event.target.checked)} />
          <span><b>LIVE USGS feed</b> · separate collection, 30-day view</span>
        </label>
      </div>

      {includeLive && (
        <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${live.stale || live.error ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          {live.error || (live.stale ? "STALE LIVE DATA" : "USGS LIVE FEED")} · Last successful retrieval: {fmtDate(live.retrievedAt)}
          {live.error && live.events.length === 0 ? " · No cached live records are available." : ""}
        </div>
      )}

      {includeDemo && (
        <div role="status" className="rounded-xl border-2 border-dashed border-violet-400 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-950">
          DEMO MODE · A synthetic Bengaluru marker is visible. It is not a real incident, alert, closure or evacuation zone.
        </div>
      )}

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5" aria-label="Incident filters">
        <label className="text-xs font-semibold text-slate-600">Hazard
          <select value={filters.hazard} onChange={(event) => setFilters((value) => ({ ...value, hazard: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
            <option value="all">All hazards</option><option value="earthquake">Earthquake</option><option value="flood">Flood</option><option value="landslide">Landslide</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">From date
          <input type="date" value={filters.startDate} onChange={(event) => setFilters((value) => ({ ...value, startDate: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" />
        </label>
        <label className="text-xs font-semibold text-slate-600">To date
          <input type="date" value={filters.endDate} onChange={(event) => setFilters((value) => ({ ...value, endDate: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Country / region
          <input value={filters.region} onChange={(event) => setFilters((value) => ({ ...value, region: event.target.value }))} placeholder="e.g. Nepal" className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Magnitude
          <select value={filters.severity} onChange={(event) => setFilters((value) => ({ ...value, severity: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
            <option value="all">All / unreported</option><option value="rated">Numeric rating reported</option><option value="unrated">No numeric rating</option>
          </select>
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700" aria-label="Map legend">
        {Object.entries({ earthquake: "Earthquake", flood: "Flood", landslide: "Landslide" }).map(([key, label]) => (
          <span key={key} className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-full" style={{ background: HAZARD_COLORS[key] }} />{label}</span>
        ))}
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={includeDemo} onChange={(event) => setIncludeDemo(event.target.checked)} /> Show DEMO DATA</label>
        <span>Map clusters are visual-only; selecting a cluster lists every underlying record.</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(350px,1fr)]">
        <div className="space-y-4">
          <GlassCard className="overflow-hidden p-2">
            <DisasterHistoryMap
              incidents={filtered}
              onSelect={(cluster) => setSelectedRecordIds(cluster.map((record) => record.id))}
              origin={origin}
              destinations={zoneCandidates}
              selectedDestinationId={selectedDestinationId}
              onSelectDestination={setSelectedDestinationId}
              route={visibleRoute}
              onChooseOrigin={chooseOrigin}
            />
          </GlassCard>
          <p className="px-1 text-xs leading-5 text-slate-600">
            Click any map point to select a route origin. District and city impact markers are approximate reference points, not event epicentres or official affected-area polygons.
          </p>
        </div>

        <div className="space-y-4">
          <GlassCard className="space-y-4 p-4">
            <div>
              <h2 className="font-semibold text-slate-900">Find Safer Zone</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">Compares routes to ArkGrid-listed non-demo shelters only. Hospitals, map-only facilities and generic public places are not assumed to be shelters.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={useMyLocation} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                <Crosshair size={15} /> Use my location
              </button>
              <button type="button" onClick={findSaferZone} disabled={zoneLoading} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                <Navigation size={15} /> {zoneLoading ? "Comparing routes…" : "Find Safer Zone"}
              </button>
            </div>
            <form onSubmit={submitOrigin} className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-slate-600">Latitude
                <input type="number" step="any" value={coordsDraft.lat} onChange={(event) => setCoordsDraft((value) => ({ ...value, lat: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-600">Longitude
                <input type="number" step="any" value={coordsDraft.lng} onChange={(event) => setCoordsDraft((value) => ({ ...value, lng: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" />
              </label>
              <button type="submit" className="col-span-2 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-200">
                <MapPin size={14} /> Set route origin
              </button>
            </form>
            {origin && <p className="text-xs text-slate-600">Origin: {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)}</p>}
            {originError && <p role="alert" className="text-xs text-amber-800">{originError}</p>}
            {!profile && <p className="text-xs text-slate-600">Sign in is required to query shelter and road reports. <a className="font-semibold text-blue-700 underline" href="/login">Sign in</a></p>}
            {zoneError && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">{zoneError}</p>}
            {zoneNotice && (
              <p role="status" className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs leading-5 text-blue-950">
                <ShieldAlert size={15} className="mt-0.5 shrink-0" />{zoneNotice}
              </p>
            )}
            {zoneCandidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                selected={selectedDestinationId === candidate.id}
                onSelect={() => setSelectedDestinationId(candidate.id)}
              />
            ))}
            {zoneCandidates.length > 0 && !roadsAvailable && (
              <p className="text-xs text-amber-800">Road report status unavailable: no route can be classified as safer.</p>
            )}
            <p className="text-xs leading-5 text-slate-500">
              Routing is based on public routing data and ArkGrid reports, which can be incomplete or outdated. A route or destination is never guaranteed safe; follow official emergency instructions. Call ahead to confirm shelter access and availability.
            </p>
            <a href="/citizen/sos" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 underline">
              Emergency? Open One-Tap SOS
            </a>
          </GlassCard>

          <GlassCard className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">{selectedRecords.length > 1 ? `Cluster records (${selectedRecords.length})` : "Incident details"}</h2>
              <span className="text-xs text-slate-500">{filtered.length} visible</span>
            </div>
            {selectedRecords.length ? selectedRecords.map((record) => <DetailRecord key={record.id} record={record} />) : (
              <p className="text-sm text-slate-600">Select a marker or cluster to see its source, event time, location precision and verification status.</p>
            )}
            {filtered.length === 0 && <p className="text-sm text-slate-600">No records match these filters. Widen the date or region filter.</p>}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
