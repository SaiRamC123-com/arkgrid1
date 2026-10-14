import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, Marker, Tooltip, CircleMarker } from "react-leaflet";
import { Play, Pause, Radar, Loader2, AlertTriangle, FlaskConical, ShieldAlert, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { simApi, safetyApi } from "../../services/simService";
import useLastFix from "../../hooks/useLastFix";
import { getMeta, setMeta } from "../../offline/queue";
import { errMsg } from "../../utils/errMsg";
import { timeAgo } from "../../utils/geo";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import { DarkTiles, FitBounds, ClickPicker, youIcon } from "../../components/map/MapKit";
import SimLayer from "../../components/sim/SimLayer";
import ScenarioControls from "../../components/sim/ScenarioControls";
import ExposurePanel from "../../components/sim/ExposurePanel";
import AdvisoryComposer from "../../components/sim/AdvisoryComposer";
import { TIERS } from "../../components/risk/riskMeta";

const DEFAULTS = { mode: "rain", radiusKm: 3, grid: 14, intensity: 25, hours: 6, antecedent: 0, height: 1.5, rise: 0.5, walk: 0.8, srcMode: "lowest" };
const DEPTH = [[0.3, "#22D3EE"], [0.9, "#6366F1"], [1.5, "#B160AF"], [99, "#FF5A6E"]];
const depthHex = (d) => DEPTH.find(([m]) => d < m)[1];
const fmtT = (m) => (m < 120 ? `+${Math.round(m)} min` : `+${(m / 60).toFixed(1)} h`);

export default function Simulator() {
  const { profile } = useAuth();
  const isCommander = profile.role === "commander";
  const { fix } = useLastFix(profile.uid);
  const gps = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const [p, setP] = useState(DEFAULTS);
  const [center, setCenter] = useState(null);
  const [source, setSource] = useState(null);
  const [picking, setPicking] = useState(null);
  const [sim, setSim] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMeta(`sim_last_${profile.uid}`).then((c) => { if (c?.sim) { setSim(c.sim); setCenter(c.sim.center); setSavedAt(c.at); } });
  }, [profile.uid]);

  const axis = useMemo(() => {
    if (!sim) return null;
    if (sim.mode === "rain") return { max: sim.scenario.rain.hours, step: 1, label: (v) => `+${v} h`, inc: 1 };
    const max = Math.ceil(sim.scenario.surge.peak_min);
    return { max, step: Math.max(1, Math.round(max / 120)), label: fmtT, inc: Math.max(1, max / 60) };
  }, [sim]);

  useEffect(() => {
    if (!playing || !axis) return;
    const id = setInterval(() => setT((v) => { const nv = Math.min(axis.max, v + axis.inc); if (nv >= axis.max) setPlaying(false); return nv; }), 450);
    return () => clearInterval(id);
  }, [playing, axis]);

  const run = async () => {
    const c = center || gps;
    if (!c) return toast.error("Waiting for your location. You can also pick a centre on the map");
    setLoading(true); setError(null); setPlaying(false);
    try {
      const body = {
        mode: p.mode, lat: c.lat, lng: c.lng, radiusM: p.radiusKm * 1000, grid: p.grid,
        ...(p.mode === "rain"
          ? { rain: { intensity: p.intensity, hours: p.hours, antecedent: p.antecedent } }
          : { surge: { height: p.height, rise: p.rise, walk: p.walk, ...(p.srcMode === "pick" && source ? { sourceLat: source.lat, sourceLng: source.lng } : {}) } }),
      };
      const r = await simApi.run(body);
      setSim(r); setCenter({ lat: c.lat, lng: c.lng }); setT(0); setSavedAt(null);
      setMeta(`sim_last_${profile.uid}`, { sim: r, at: Date.now() });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const onPick = (pt) => {
    if (picking === "center") setCenter(pt);
    if (picking === "source") { setSource(pt); setP((x) => ({ ...x, srcMode: "pick" })); }
    setPicking(null);
  };

  const level = sim?.mode === "surge" ? sim.source.elev + Math.min(sim.scenario.surge.height_m, (sim.scenario.surge.rise_m_per_h * t) / 60) : null;
  const styleOf = (c, k) => {
    if (!sim) return null;
    if (sim.mode === "rain") {
      const tier = sim.frames[Math.round(t)].tiers[k];
      return { hex: TIERS[tier].hex, op: tier === 0 ? 0.1 : TIERS[tier].fill };
    }
    if (c.t == null || c.t > t) return null;
    return { hex: depthHex(Math.max(0, level - c.elev)), op: 0.5 };
  };

  const stats = useMemo(() => {
    if (!sim) return null;
    if (sim.mode === "rain") return sim.frames[Math.round(t)].counts;
    const wet = sim.cells.filter((c) => c.t != null && c.t <= t);
    const km2 = (wet.length * sim.cell.size_m ** 2) / 1e6;
    return { wet: wet.length, km2: km2.toFixed(2), pct: ((wet.length / sim.cells.length) * 100).toFixed(0) };
  }, [sim, t]);

  const fitPoints = sim ? [[sim.bounds.south, sim.bounds.west], [sim.bounds.north, sim.bounds.east]] : gps ? [[gps.lat, gps.lng]] : [];
  const tNow = sim ? (sim.mode === "rain" ? t * 60 : t) : 0;

  const publish = async () => {
    const hours = Number(window.prompt("Keep this as the live responder-safety overlay for how many hours? (1-24)", "6"));
    if (!hours) return;
    setBusy(true);
    try { await safetyApi.publish(sim.simId, hours); toast.success("Published. Responders near trap zones now trigger alerts"); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">What-If <span className="text-gradient">Simulator</span></h1>
        <p className="mt-1 text-sm text-slate-400">Test hypothetical rainfall or water-surge scenarios and see what gets hit, and when.</p>
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-ark-indigo/40 bg-ark-indigo/10 px-5 py-3 text-sm text-indigo-200">
        <FlaskConical size={18} className="mt-0.5 shrink-0" />
        <span>A scenario is not a forecast. Results come from prototype models on 90 m terrain with assumed parameters, and are for planning and comparison only.</span>
      </div>
      {error && <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/50 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral"><AlertTriangle size={17} /> {error}</div>}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <ScenarioControls p={p} setP={setP} source={source} picking={picking} canGps={!!gps}
            onUseGps={() => gps && setCenter(gps)} onPickCenter={() => setPicking((x) => (x === "center" ? null : "center"))} onPickSource={() => setPicking((x) => (x === "source" ? null : "source"))} />
          <Button onClick={run} disabled={loading} className="w-full">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Radar size={16} />} {loading ? "Simulating…" : "Run scenario"}
          </Button>
          {sim && <p className="text-center text-xs text-slate-500">{savedAt ? `Showing a saved run from ${timeAgo(new Date(savedAt).toISOString())}` : `Run ${timeAgo(sim.generated_at)}`} · terrain: {sim.sources.elevation}</p>}
        </div>

        <div className="space-y-4 lg:col-span-3">
          <GlassCard className="relative overflow-hidden p-2">
            <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[360px] w-full sm:h-[500px]" scrollWheelZoom>
              <DarkTiles />
              <FitBounds points={fitPoints} fitKey={sim ? sim.generated_at : "none"} />
              {picking && <ClickPicker onPick={onPick} />}
              {sim && <SimLayer cells={sim.cells} cell={sim.cell} styleOf={styleOf} interactive={!picking} />}
              {sim?.mode === "surge" && <CircleMarker center={[sim.source.lat, sim.source.lng]} radius={8} interactive={false} pathOptions={{ color: "#fff", fillColor: "#6366F1", fillOpacity: 1, weight: 3 }}><Tooltip permanent direction="top">Water source{sim.source.assumed ? " (assumed)" : ""}</Tooltip></CircleMarker>}
              {center && <CircleMarker center={[center.lat, center.lng]} radius={6} interactive={false} pathOptions={{ color: "#fff", fillColor: "#070B1F", fillOpacity: 1, weight: 3 }} />}
              {source && p.srcMode === "pick" && !sim && <CircleMarker center={[source.lat, source.lng]} radius={8} pathOptions={{ color: "#fff", fillColor: "#6366F1", fillOpacity: 1, weight: 3 }} />}
              {gps && <Marker position={[gps.lat, gps.lng]} icon={youIcon} zIndexOffset={1000}><Tooltip direction="top" offset={[0, -10]}>You are here</Tooltip></Marker>}
            </MapContainer>
            {loading && <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-3 bg-navy-900/70 backdrop-blur-sm"><Loader2 size={32} className="animate-spin text-ark-cyan" /><p className="text-sm text-slate-300">Reading terrain and running the scenario…</p></div>}
          </GlassCard>

          {sim && axis && (
            <GlassCard className="space-y-3">
              <div className="flex items-center gap-3">
                <button onClick={() => { if (t >= axis.max) setT(0); setPlaying((x) => !x); }} className="rounded-xl bg-gradient-to-r from-ark-indigo to-ark-cyan p-3 text-white shadow-glow-indigo">{playing ? <Pause size={18} /> : <Play size={18} />}</button>
                <div className="flex-1">
                  <input type="range" min={0} max={axis.max} step={axis.step} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} className="w-full accent-ark-cyan" />
                  <div className="flex justify-between text-[11px] text-slate-500"><span>now</span><span>{axis.label(axis.max)}</span></div>
                </div>
                <p className="w-24 text-right font-display text-lg font-bold text-ark-cyan">{axis.label(t)}</p>
              </div>
              {sim.mode === "rain" ? (
                <div className="grid grid-cols-4 gap-2 text-center">
                  {TIERS.map((x) => <div key={x.id} className="rounded-xl bg-white/5 p-2"><p className="font-display text-xl font-bold" style={{ color: x.hex }}>{stats[x.id]}</p><p className="text-[11px] text-slate-400">{x.label} cells</p></div>)}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["Under water", `${stats.km2} km²`], ["Of the area", `${stats.pct}%`], ["Level now", `+${(level - sim.source.elev).toFixed(2)} m`]].map(([l, v]) => <div key={l} className="rounded-xl bg-white/5 p-2"><p className="font-display text-xl font-bold text-ark-cyan">{v}</p><p className="text-[11px] text-slate-400">{l}</p></div>)}
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                {sim.mode === "rain" ? TIERS.map((x) => <span key={x.id}><b style={{ color: x.hex }}>■</b> {x.label}</span>) : DEPTH.map(([m, h], i) => <span key={m}><b style={{ color: h }}>■</b> {i === 0 ? "<0.3 m" : i === 3 ? "≥1.5 m" : `<${m} m`}</span>)}
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {sim && (
        <>
          {sim.warnings.length > 0 && (
            <GlassCard className="space-y-2">
              {sim.warnings.map((w) => <p key={w} className="flex items-start gap-2 text-xs text-indigo-200"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-ark-coral" /> {w}</p>)}
            </GlassCard>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <ExposurePanel sim={sim} tNow={tNow} />
            <div className="space-y-6">
              {sim.mode === "surge" && (
                <GlassCard className="space-y-3">
                  <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><ShieldAlert size={19} className="text-ark-coral" /> Flash-surge traps</h3>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl bg-white/5 p-3"><p className="font-display text-2xl font-bold text-ark-coral">{sim.summary.trap_km2} km²</p><p className="text-[11px] text-slate-400">{sim.summary.trap_cells} trap cells</p></div>
                    <div className="rounded-xl bg-white/5 p-3"><p className="font-display text-2xl font-bold text-indigo-300">{sim.summary.flooded_pct}%</p><p className="text-[11px] text-slate-400">of the area floods</p></div>
                  </div>
                  <p className="text-xs text-slate-400">A trap is ground where water arrives before a person could walk (at {sim.scenario.surge.walk_ms} m/s, straight line) to ground that stays dry. Responders must not enter these.</p>
                  <Link to="/command/drone-safety" className="block text-center text-sm font-semibold text-ark-cyan hover:underline">Open Drone and Responder Safety</Link>
                  {isCommander && <Button onClick={publish} loading={busy} variant="ghost" className="w-full">Publish as live safety overlay</Button>}
                  {isCommander && <button onClick={() => safetyApi.clear().then(() => toast.success("Overlay cleared")).catch((e) => toast.error(errMsg(e)))} className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-ark-coral hover:underline"><Trash2 size={13} /> Clear the published overlay</button>}
                </GlassCard>
              )}
              {isCommander && <AdvisoryComposer sim={sim} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}