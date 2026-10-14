import { useState } from "react";
import { Crosshair, MapPin, Loader2, ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { fetchRouteAlternatives, straightRoute, fmtDuration } from "../../utils/routing";
import { routeHazards, fmtDistance } from "../../utils/geo";
import { cellAt, routeScenarioStats, nearPoints, verdict, verdictRank } from "../../utils/safetyGeo";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";

const V = {
  go: { label: "GO", cls: "border-ark-cyan bg-ark-cyan/15 text-ark-cyan shadow-glow-cyan", hex: "#22D3EE", icon: ShieldCheck },
  caution: { label: "CAUTION", cls: "border-ark-indigo bg-ark-indigo/20 text-indigo-200", hex: "#6366F1", icon: AlertTriangle },
  nogo: { label: "NO-GO", cls: "border-ark-coral bg-ark-coral/20 text-ark-coral shadow-glow-coral", hex: "#FF5A6E", icon: ShieldAlert },
};

export default function MissionGate({ targets, teams, gps, sim, roads, powerlines, staging, setStaging, pickMode, onPickStaging, onRoutes }) {
  const [targetId, setTargetId] = useState("");
  const [onScene, setOnScene] = useState(20);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const [pick, setPick] = useState(0);

  const run = async () => {
    const target = targets.find((t) => t.id === targetId);
    if (!staging) return toast.error("Choose a staging point");
    if (!target) return toast.error("Choose a target");
    setLoading(true);
    try {
      let opts;
      let approx = false;
      try { opts = await fetchRouteAlternatives(staging, target); }
      catch { opts = [straightRoute(staging, target, "driving")]; approx = true; toast("Routing unavailable. Straight-line check only", { icon: "📡" }); }
      const tc = sim ? cellAt(sim, target) : null;
      const evals = opts.map((o) => {
        const stats = sim ? routeScenarioStats(o.coords, sim) : null;
        const hazards = approx ? [] : routeHazards(o.coords, roads);
        const pls = nearPoints(o.coords, powerlines, 100);
        return { ...o, stats, hazards, pls, v: verdict({ travelMin: o.durationS / 60, onSceneMin: onScene, stats, hazards, powerlines: pls, targetCell: tc != null ? sim.cells[tc].status : null }) };
      }).sort((a, b) => verdictRank(a.v) - verdictRank(b.v) || a.hazards.length - b.hazards.length || a.durationS - b.durationS);
      setRes({ evals, approx });
      setPick(0);
      onRoutes(evals.map((e, i) => ({ coords: e.coords, color: i === 0 ? V[e.v.level].hex : "#64748B" })));
    } catch (err) {
      toast.error(err.message || "Could not check the route");
    } finally {
      setLoading(false);
    }
  };

  const sel = res?.evals[pick];
  const V0 = sel && V[sel.v.level];

  return (
    <GlassCard className="space-y-4">
      <h3 className="font-display text-lg font-semibold">Ground mission gate</h3>
      <p className="text-xs text-slate-400">Checks that a route in and back out stays clear of reported hazards and, with a surge scenario loaded, stays dry long enough for the whole mission.</p>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-slate-400">Staging point</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={!gps} onClick={() => setStaging({ ...gps })} className="!px-3 !py-1.5 !text-xs"><Crosshair size={13} /> My location</Button>
          <Button variant={pickMode === "staging" ? "danger" : "ghost"} onClick={onPickStaging} className="!px-3 !py-1.5 !text-xs"><MapPin size={13} /> {pickMode === "staging" ? "Tap the map…" : "Pick on map"}</Button>
          <select className="input-glass !w-auto !py-1.5 !text-xs [&>option]:bg-navy-800" value="" onChange={(e) => { const t = teams.find((x) => x.id === e.target.value); if (t?.location) setStaging({ lat: t.location.lat, lng: t.location.lng }); }}>
            <option value="">A team's position…</option>
            {teams.filter((t) => t.location).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <p className="text-xs text-slate-500">{staging ? `Staging at ${staging.lat.toFixed(4)}, ${staging.lng.toFixed(4)}` : "Not set"}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <select className="input-glass [&>option]:bg-navy-800" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Target…</option>
          {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-400">On scene
          <input type="number" min={1} max={240} value={onScene} onChange={(e) => setOnScene(Number(e.target.value))} className="input-glass !py-1.5 !text-sm" /> min
        </label>
      </div>

      <Button onClick={run} disabled={loading} className="w-full">{loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Check route</Button>
      {!sim && <p className="text-xs text-indigo-300">No surge scenario loaded, so only reported road and powerline hazards are checked. Run a water-surge scenario in the Simulator to add the flood-timing check.</p>}

      {sel && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {res.evals.map((e, i) => <button key={i} onClick={() => setPick(i)} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${i === pick ? V[e.v.level].cls : "border-white/10 text-slate-400"}`}>Route {i + 1} · {V[e.v.level].label}</button>)}
          </div>
          <div className={`flex items-center gap-3 rounded-2xl border px-5 py-4 ${V0.cls}`}>
            <V0.icon size={28} />
            <div>
              <p className="font-display text-2xl font-bold">{V0.label}</p>
              <p className="text-xs opacity-80">{fmtDistance(sel.distanceM)} · {fmtDuration(sel.durationS)} each way · needs about {Math.round(sel.v.need)} min in total{res.approx ? " · straight-line estimate" : ""}</p>
            </div>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-300">{sel.v.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="text-[11px] text-slate-500">Margin rule (assumption): go needs the safe window to be at least 1.5 times the mission time. This tool cannot see everything, so it never replaces a scout, local knowledge, or the incident chief's decision. Ingress and egress use the same route here.</p>
        </div>
      )}
    </GlassCard>
  );
}