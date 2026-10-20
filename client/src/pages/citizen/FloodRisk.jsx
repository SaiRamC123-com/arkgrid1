import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, MapPin, Loader2, AlertTriangle, WifiOff, Radar, FlaskConical, Layers } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { riskApi } from "../../services/riskService";
import useLastFix from "../../hooks/useLastFix";
import { getMeta, setMeta } from "../../offline/queue";
import { timeAgo } from "../../utils/geo";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import RiskMap from "../../components/risk/riskMap";
import {
  TierBar,
  RainPanel,
  CellDetail,
  ModelCard,
  FloodMonitoringPanel,
  MonitoringZoneBar,
  AnalysisMethodsCard,
} from "../../components/risk/RiskPanels";
import { TIERS } from "../../components/risk/riskMeta";

const DETAIL = [["Fast", 10], ["Balanced", 14], ["Detailed", 20]];
const monitorColors = {
  RED: "#fb7185",
  YELLOW: "#fbbf24",
  GREEN: "#4ade80",
  UNKNOWN: "#94a3b8",
};

export default function FloodRisk() {
  const { profile } = useAuth();
  const isStaff = profile.role !== "citizen";
  const { fix } = useLastFix(profile.uid);
  const gps = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const [center, setCenter] = useState(null);
  const [picking, setPicking] = useState(false);
  const [radiusKm, setRadiusKm] = useState(3);
  const [grid, setGrid] = useState(14);
  const [scenarioOn, setScenarioOn] = useState(false);
  const [rain24, setRain24] = useState(120);
  const [result, setResult] = useState(null);
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(false);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [error, setError] = useState(null);
  const [monitoringError, setMonitoringError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [selected, setSelected] = useState(null);
  const [activeLayer, setActiveLayer] = useState("monitoring");
  const [mlOffline, setMlOffline] = useState(false);
  const auto = useRef(false);

  // Show the last saved analysis immediately (works offline)
  useEffect(() => {
    getMeta(`risk_last_${profile.uid}`).then((c) => {
      if (c?.data) {
        setResult((r) => r || c.data);
        setCenter((x) => x || c.data.center);
        setSavedAt(c.at);
      }
    });
  }, [profile.uid]);

  const run = useCallback(
    async (c) => {
      if (!c) return toast.error("Waiting for your location. You can also pick a point on the map");
      setLoading(true);
      setMonitoringLoading(true);
      setError(null);
      setMonitoringError(null);
      setCenter(c);
      setSelected(null);

      const modelRequest = riskApi.assess({
        lat: c.lat,
        lng: c.lng,
        radiusM: radiusKm * 1000,
        grid,
        ...(isStaff && scenarioOn ? { rain24, rain1: Math.round(rain24 * 0.25) } : {}),
      });
      const monitoringRequest = riskApi.monitor({ lat: c.lat, lng: c.lng, radiusKm, grid });
      const [modelOutcome, monitoringOutcome] = await Promise.allSettled([modelRequest, monitoringRequest]);

      if (modelOutcome.status === "fulfilled") {
        setResult(modelOutcome.value);
        setMlOffline(false);
        setSavedAt(null);
        setMeta(`risk_last_${profile.uid}`, { data: modelOutcome.value, at: Date.now() });
      } else {
        setMlOffline(true);
        setError(errMsg(modelOutcome.reason));
      }

      if (monitoringOutcome.status === "fulfilled") {
        setMonitoring(monitoringOutcome.value);
      } else {
        setMonitoringError(errMsg(monitoringOutcome.reason));
      }

      setLoading(false);
      setMonitoringLoading(false);
    },
    [radiusKm, grid, scenarioOn, rain24, isStaff, profile.uid]
  );

  // Analyse around the user automatically the first time a GPS fix arrives
  useEffect(() => {
    if (gps && !auto.current) {
      auto.current = true;
      run(gps);
    }
  }, [gps, run]);

  const onPick = useCallback((p) => {
    setPicking(false);
    run(p);
  }, [run]);

  const onSelect = useCallback((c) => setSelected(c), []);

  const resultMatchesCenter = result && center
    && Math.abs(result.center.lat - center.lat) < 0.00005
    && Math.abs(result.center.lng - center.lng) < 0.00005
    && result.radius_m === radiusKm * 1000
    && result.grid === grid;
  const activeResult = resultMatchesCenter ? result : null;

  const monitoringMatchesCenter = monitoring && center
    && Math.abs(monitoring.center.lat - center.lat) < 0.00005
    && Math.abs(monitoring.center.lng - center.lng) < 0.00005
    && monitoring.radiusKm === radiusKm
    && monitoring.grid === grid;
  const activeMonitoring = monitoringMatchesCenter ? monitoring : null;

  const currentBounds = activeLayer === "ml" && activeResult?.bounds
    ? activeResult.bounds
    : activeMonitoring?.bounds || activeResult?.bounds;
  const fitPoints = currentBounds
    ? [[currentBounds.south, currentBounds.west], [currentBounds.north, currentBounds.east]]
    : gps ? [[gps.lat, gps.lng]] : [];
  const fitKey = `${activeMonitoring?.generatedAt || activeResult?.generated_at || "none"}-${activeLayer}`;

  const synthetic = activeResult?.sources?.elevation?.startsWith("synthetic");
  const worst = activeResult ? TIERS[activeResult.summary.max_tier] : null;
  const busy = loading || monitoringLoading;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">
          Flood <span className="text-gradient">Risk</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">Live-source flood monitoring with an optional terrain-susceptibility model around your selected location.</p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-ark-indigo/40 bg-ark-indigo/10 px-5 py-3 text-sm text-indigo-200">
        <FlaskConical size={18} className="mt-0.5 shrink-0" />
        <span>The ML susceptibility mask is an unvalidated prototype and is optional. Live real-data monitoring operates independently; neither a GREEN screen nor a model result is a safety clearance.</span>
      </div>

      {synthetic && (
        <div className="flex items-start gap-3 rounded-2xl border border-ark-coral/60 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral shadow-glow-coral">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>Real terrain data could not be loaded, so this map uses made-up demo terrain and is meaningless. Check your connection and run it again.</span>
        </div>
      )}

      {mlOffline && error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-5 py-3 text-sm text-amber-200">
          <div className="flex items-center gap-3">
            <WifiOff size={17} className="shrink-0" />
            <span>ML susceptibility model is offline ({error}). Real-data flood monitoring and risk zones remain fully active below.</span>
          </div>
          <span className="shrink-0 rounded-lg bg-amber-400/20 px-2 py-0.5 text-xs font-semibold uppercase">Fallback Active</span>
        </div>
      )}

      {monitoringError && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/50 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral">
          <WifiOff size={17} /> Live flood monitoring unavailable: {monitoringError}
        </div>
      )}

      {savedAt && !error && activeResult && (
        <p className="text-xs text-slate-500">Showing a saved analysis from {timeAgo(new Date(savedAt).toISOString())}.</p>
      )}

      {result && !activeResult && (
        <p className="text-xs text-slate-500">
          {savedAt
            ? "The saved ML analysis is for a different location or area detail and is hidden; it will not be shown as current."
            : "The previous ML result is hidden because its location or area detail differs from the current selection."}
        </p>
      )}

      {/* Controls */}
      <GlassCard className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>Area radius</span><span className="text-ark-cyan">{radiusKm} km</span>
            </div>
            <input type="range" min={1} max={8} step={0.5} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="w-full accent-ark-cyan" />
          </div>
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wider text-slate-400">Detail</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
              {DETAIL.map(([l, v]) => (
                <button key={v} onClick={() => setGrid(v)}
                  className={`rounded-lg py-1.5 text-sm font-semibold transition ${grid === v ? "bg-gradient-to-r from-ark-indigo to-ark-cyan text-white" : "text-slate-400"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isStaff && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
              <span className="flex items-center gap-2"><FlaskConical size={16} className="text-ark-coral" /> Rainfall scenario (staff)</span>
              <input type="checkbox" checked={scenarioOn} onChange={(e) => setScenarioOn(e.target.checked)} className="accent-ark-coral" />
            </label>
            {scenarioOn && (
              <div className="mt-3">
                <div className="mb-1.5 flex justify-between text-xs uppercase tracking-wider text-slate-400">
                  <span>24 h rainfall</span><span className="text-ark-coral">{rain24} mm (peak {Math.round(rain24 * 0.25)} mm/h)</span>
                </div>
                <input type="range" min={0} max={300} step={10} value={rain24} onChange={(e) => setRain24(Number(e.target.value))} className="w-full accent-ark-coral" />
                <p className="mt-1 text-xs text-slate-500">Overrides the live forecast so you can see how risk shifts under heavier rain.</p>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Button onClick={() => run(gps || center)} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Radar size={16} />} {busy ? "Analysing…" : "Analyse area"}
          </Button>
          <Button variant="ghost" onClick={() => gps && run(gps)} disabled={!gps || busy}><Crosshair size={16} /> My location</Button>
          <Button variant={picking ? "danger" : "ghost"} onClick={() => setPicking((p) => !p)} disabled={busy}>
            <MapPin size={16} /> {picking ? "Tap the map…" : "Pick a point"}
          </Button>
        </div>
      </GlassCard>

      {/* Map Header & Layer Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="flex items-center gap-1.5 uppercase tracking-wider text-slate-400">
            <Layers size={14} className="text-ark-cyan" /> Layer:
          </span>
          <div className="inline-flex rounded-xl bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setActiveLayer("monitoring")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                activeLayer === "monitoring"
                  ? "bg-gradient-to-r from-emerald-500 to-ark-cyan text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Live Risk Zones (Real Data)
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeResult) {
                  setActiveLayer("ml");
                } else {
                  toast.error("ML model is offline. Live real-data risk zones are active.");
                }
              }}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                activeLayer === "ml"
                  ? "bg-gradient-to-r from-ark-indigo to-ark-cyan text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              ML Terrain Mask {activeResult ? "" : "(Offline)"}
            </button>
          </div>
        </div>

        {activeMonitoring && activeLayer === "monitoring" && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: monitorColors[activeMonitoring.status] || "#4ade80" }} />
            <span>
              Area Status: <b style={{ color: monitorColors[activeMonitoring.status] || "#4ade80" }}>{activeMonitoring.status}</b> ({activeMonitoring.basis})
            </span>
          </div>
        )}
      </div>

      {/* Map */}
      <GlassCard className="relative overflow-hidden p-2">
        <RiskMap
          result={activeResult}
          monitoring={activeMonitoring}
          activeLayer={activeLayer}
          selectedKey={selected ? `${selected.i}-${selected.j}` : null}
          onSelect={onSelect}
          gps={gps}
          center={center}
          picking={picking}
          onPick={onPick}
          fitPoints={fitPoints}
          fitKey={fitKey}
        />
        {busy && (
          <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-3 bg-navy-900/70 backdrop-blur-sm">
            <Loader2 size={34} className="animate-spin text-ark-cyan" />
            <p className="text-sm text-slate-300">Reading weather, alerts, and field observations…</p>
          </div>
        )}
      </GlassCard>

      <p className="px-1 text-xs text-slate-500">
        Grid cells show evaluated real-data flood risk. Weather dots are Open-Meteo model samples; event markers are GDACS point centroids; red field markers are verified ArkGrid reports. Markers do not outline flooded areas.
      </p>

      {/* Map Legend */}
      {activeLayer === "monitoring" && activeMonitoring && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#4ade80]" /> Low Risk (Green)</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#fbbf24]" /> Heavy Rain / Watch (Yellow)</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#fb7185]" /> High Risk / Confirmed (Red)</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#94a3b8]" /> Incomplete Data (Unknown)</span>
          <span className="ml-auto">
            Overall: <b style={{ color: monitorColors[activeMonitoring.status] }}>{activeMonitoring.status}</b> · assessed {timeAgo(activeMonitoring.generatedAt)}
          </span>
        </div>
      )}

      {activeLayer === "ml" && activeResult && worst && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-slate-400">
          {TIERS.map((t) => (
            <span key={t.id} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: t.hex }} /> {t.label}</span>
          ))}
          <span className="ml-auto">Highest model tier here: <b style={{ color: worst.hex }}>{worst.label}</b> · analysed {timeAgo(activeResult.generated_at)}{activeResult.cached ? " (cached)" : ""}</span>
        </div>
      )}

      {selected && <CellDetail cell={selected} onClose={() => setSelected(null)} />}

      {/* Risk Breakdown & Rainfall Panels */}
      <div className="grid gap-6 md:grid-cols-2">
        {activeLayer === "ml" && activeResult ? (
          <TierBar summary={activeResult.summary} />
        ) : (
          <MonitoringZoneBar
            summary={activeMonitoring?.zoneSummary}
            status={activeMonitoring?.status || "UNKNOWN"}
            basis={activeMonitoring?.basis || "data_unavailable"}
          />
        )}

        <RainPanel
          inputs={
            activeResult
              ? activeResult.inputs
              : {
                  rain_24h_mm: activeMonitoring?.weather?.coverage?.maxForecast24Mm ?? 0,
                  rain_1h_mm: activeMonitoring?.weather?.coverage?.maxPeakHourlyMm ?? 0,
                  weather: {
                    past24_mm: activeMonitoring?.weather?.coverage?.past24MaxMm ?? 0,
                    next24_mm: activeMonitoring?.weather?.coverage?.maxForecast24Mm ?? 0,
                    now_mm: activeMonitoring?.weather?.points?.[0]?.currentPrecipitationMm ?? 0,
                  },
                }
          }
          sources={
            activeResult
              ? activeResult.sources
              : { rain: activeMonitoring?.weather?.source || "Open-Meteo Forecast API" }
          }
        />
      </div>

      {/* On-the-ground check */}
      {(activeMonitoring?.fieldReports || activeResult?.observed) && (
        <GlassCard>
          <h3 className="font-display text-lg font-semibold">On-the-ground check</h3>
          <p className="mt-2 text-sm text-slate-300">
            In this area right now:{" "}
            <b className="text-ark-coral">
              {activeMonitoring?.fieldReports?.reports?.length ?? activeResult?.observed?.roads ?? 0}
            </b>{" "}
            verified flooded or blocked road report{activeMonitoring?.fieldReports?.reports?.length === 1 ? "" : "s"} and{" "}
            <b className="text-ark-coral">
              {activeMonitoring?.fieldReports?.reports?.filter((r) => r.title?.includes("submerged")).length ?? activeResult?.observed?.reports ?? 0}
            </b>{" "}
            verified flooded-road photo report(s) (last 48 h).
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Compare these with the map zones. When they disagree, trust the verified reports and treat model forecasts with extra caution.
          </p>
        </GlassCard>
      )}

      {/* Analysis Methods & Documented Thresholds */}
      <AnalysisMethodsCard
        methods={activeMonitoring?.analysisMethods}
        thresholds={activeMonitoring?.thresholds}
        mlOffline={mlOffline || !activeResult}
      />

      {activeResult && <ModelCard result={activeResult} />}

      <FloodMonitoringPanel result={activeMonitoring} error={monitoringError} loading={monitoringLoading} />
    </div>
  );
}