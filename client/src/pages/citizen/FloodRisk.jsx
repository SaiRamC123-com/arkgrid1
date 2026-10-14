import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, MapPin, Loader2, AlertTriangle, WifiOff, Radar, FlaskConical } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { riskApi } from "../../services/riskService";
import useLastFix from "../../hooks/useLastFix";
import { getMeta, setMeta } from "../../offline/queue";
import { timeAgo } from "../../utils/geo";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import RiskMap from "../../components/risk/RiskMap";
import { TierBar, RainPanel, CellDetail, ModelCard } from "../../components/risk/RiskPanels";
import { TIERS } from "../../components/risk/riskMeta";

const DETAIL = [["Fast", 10], ["Balanced", 14], ["Detailed", 20]];

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [selected, setSelected] = useState(null);
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
      setError(null);
      try {
        const data = await riskApi.assess({
          lat: c.lat, lng: c.lng, radiusM: radiusKm * 1000, grid,
          ...(isStaff && scenarioOn ? { rain24, rain1: Math.round(rain24 * 0.25) } : {}),
        });
        setResult(data);
        setCenter(c);
        setSelected(null);
        setSavedAt(null);
        setMeta(`risk_last_${profile.uid}`, { data, at: Date.now() });
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setLoading(false);
      }
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

  const fitPoints = result
    ? [[result.bounds.south, result.bounds.west], [result.bounds.north, result.bounds.east]]
    : gps ? [[gps.lat, gps.lng]] : [];
  const fitKey = result ? result.generated_at : "none";
  const synthetic = result?.sources.elevation.startsWith("synthetic");
  const worst = result ? TIERS[result.summary.max_tier] : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">
          Flood <span className="text-gradient">Risk</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">Terrain and rainfall scored into a 4-tier susceptibility mask around you.</p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-ark-indigo/40 bg-ark-indigo/10 px-5 py-3 text-sm text-indigo-200">
        <FlaskConical size={18} className="mt-0.5 shrink-0" />
        <span>Prototype model, not validated against real flood events. Use it as one input, never as the only basis for evacuation or dispatch decisions.</span>
      </div>

      {synthetic && (
        <div className="flex items-start gap-3 rounded-2xl border border-ark-coral/60 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral shadow-glow-coral">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>Real terrain data could not be loaded, so this map uses made-up demo terrain and is meaningless. Check your connection and run it again.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/50 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral">
          <WifiOff size={17} /> {error}{savedAt || result ? ". Showing your last saved analysis." : ""}
        </div>
      )}
      {savedAt && !error && (
        <p className="text-xs text-slate-500">Showing a saved analysis from {timeAgo(new Date(savedAt).toISOString())}.</p>
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
          <Button onClick={() => run(gps || center)} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Radar size={16} />} {loading ? "Analysing…" : "Analyse area"}
          </Button>
          <Button variant="ghost" onClick={() => gps && run(gps)} disabled={!gps || loading}><Crosshair size={16} /> My location</Button>
          <Button variant={picking ? "danger" : "ghost"} onClick={() => setPicking((p) => !p)} disabled={loading}>
            <MapPin size={16} /> {picking ? "Tap the map…" : "Pick a point"}
          </Button>
        </div>
      </GlassCard>

      {/* Map */}
      <GlassCard className="relative overflow-hidden p-2">
        <RiskMap
          result={result}
          selectedKey={selected ? `${selected.i}-${selected.j}` : null}
          onSelect={onSelect}
          gps={gps}
          center={center}
          picking={picking}
          onPick={onPick}
          fitPoints={fitPoints}
          fitKey={fitKey}
        />
        {loading && (
          <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-3 bg-navy-900/70 backdrop-blur-sm">
            <Loader2 size={34} className="animate-spin text-ark-cyan" />
            <p className="text-sm text-slate-300">Reading terrain and rainfall…</p>
          </div>
        )}
      </GlassCard>

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-slate-400">
            {TIERS.map((t) => (
              <span key={t.id} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: t.hex }} /> {t.label}</span>
            ))}
            <span className="ml-auto">Highest tier here: <b style={{ color: worst.hex }}>{worst.label}</b> · analysed {timeAgo(result.generated_at)}{result.cached ? " (cached)" : ""}</span>
          </div>

          {selected && <CellDetail cell={selected} onClose={() => setSelected(null)} />}

          <div className="grid gap-6 md:grid-cols-2">
            <TierBar summary={result.summary} />
            <RainPanel inputs={result.inputs} sources={result.sources} />
          </div>

          {result.observed && (
            <GlassCard>
              <h3 className="font-display text-lg font-semibold">On-the-ground check</h3>
              <p className="mt-2 text-sm text-slate-300">
                In this area right now: <b className="text-ark-coral">{result.observed.roads}</b> verified flooded or blocked road report{result.observed.roads === 1 ? "" : "s"} and{" "}
                <b className="text-ark-coral">{result.observed.reports}</b> verified flooded-road photo report{result.observed.reports === 1 ? "" : "s"} (last 48 h).
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Compare these with the mask. When they disagree, trust the verified reports and treat the model with extra caution.
              </p>
            </GlassCard>
          )}

          <ModelCard result={result} />
        </>
      )}
    </div>
  );
}