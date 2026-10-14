import { useState } from "react";
import { Plane, Wind, Download, Crosshair, MapPin, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { planDrone, toGPX } from "../../utils/dronePlan";
import { distanceM, fmtDistance } from "../../utils/geo";
import { cellAt } from "../../utils/safetyGeo";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";

const KIND = { sos: "SOS", incident: "Incident", infra: "Infrastructure", road: "Road" };

export default function DronePlanner({ targets, gps, sim, powerlines, launch, setLaunch, pickMode, onPickLaunch, onPlan }) {
  const [ids, setIds] = useState(new Set());
  const [prm, setPrm] = useState({ speed: 8, endurance: 25, reserve: 30 });
  const [wind, setWind] = useState(null);
  const [wLoading, setWLoading] = useState(false);
  const [plan, setPlan] = useState(null);

  const toggle = (id) => setIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = targets.filter((t) => ids.has(t.id));

  const suggest = () => {
    if (!sim) return toast.error("Run a surge scenario first so dry ground can be found");
    const dry = sim.cells.filter((c) => c.status === 0);
    if (!dry.length) return toast.error("No ground stays dry in this scenario");
    const pts = chosen.length ? chosen : targets;
    const score = (c) => pts.reduce((s, t) => s + distanceM(c, t), 0) / Math.max(1, pts.length) - c.elev * 5;
    const best = dry.reduce((a, c) => (score(c) < score(a) ? c : a));
    setLaunch({ lat: best.lat, lng: best.lng });
    toast.success("Suggested the dry ground nearest your targets. Check access and airspace on site");
  };

  const fetchWind = async () => {
    const p = launch || gps;
    if (!p) return toast.error("Set a launch point first");
    setWLoading(true);
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(4)}&longitude=${p.lng.toFixed(4)}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation&wind_speed_unit=ms`);
      if (!r.ok) throw new Error();
      const c = (await r.json()).current;
      setWind({ speed: c.wind_speed_10m, dir: c.wind_direction_10m, gust: c.wind_gusts_10m, rain: c.precipitation });
    } catch {
      setWind(null);
      toast.error("Could not fetch wind. Check it before flying");
    } finally {
      setWLoading(false);
    }
  };

  const windVerdict = wind && (wind.gust >= 10 ? { l: "NO-GO", c: "text-ark-coral", t: "Gusts at or above 10 m/s exceed the limit of many small drones (assumed). Check your aircraft's rating." }
    : wind.gust >= 7 || wind.speed >= 6 ? { l: "CAUTION", c: "text-indigo-300", t: "Strong or gusty wind will cut range and stability." }
    : { l: "OK", c: "text-ark-cyan", t: "Wind is moderate." });

  const run = () => {
    if (!launch) return toast.error("Set a launch point");
    if (!chosen.length) return toast.error("Select at least one target");
    const p = planDrone({ launch, targets: chosen, speed: prm.speed, enduranceMin: prm.endurance, reservePct: prm.reserve, wind: wind ? { speed: wind.speed, dir: wind.dir } : null });
    setPlan(p);
    onPlan({ order: p.order });
  };

  const launchCell = launch && sim ? cellAt(sim, launch) : null;
  const launchBad = launchCell != null && [2, 3].includes(sim.cells[launchCell].status);
  const launchPl = launch && powerlines.some((p) => distanceM(launch, p) <= 100);
  const download = () => {
    const url = URL.createObjectURL(new Blob([toGPX(launch, plan.order)], { type: "application/gpx+xml" }));
    Object.assign(document.createElement("a"), { href: url, download: "arkgrid-drone-plan.gpx" }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <GlassCard className="space-y-4">
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Plane size={19} className="text-ark-cyan" /> Drone inspection planner</h3>
      <p className="text-xs text-slate-400">Plans a closed loop from a safe launch point, adding the highest-priority targets that fit inside the usable battery time.</p>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-slate-400">Launch point</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={!gps} onClick={() => setLaunch({ ...gps })} className="!px-3 !py-1.5 !text-xs"><Crosshair size={13} /> My location</Button>
          <Button variant="ghost" onClick={suggest} className="!px-3 !py-1.5 !text-xs"><ShieldCheck size={13} /> Suggest safe launch</Button>
          <Button variant={pickMode === "launch" ? "danger" : "ghost"} onClick={onPickLaunch} className="!px-3 !py-1.5 !text-xs"><MapPin size={13} /> {pickMode === "launch" ? "Tap the map…" : "Pick on map"}</Button>
        </div>
        {launch && <p className="text-xs text-slate-500">Launch at {launch.lat.toFixed(4)}, {launch.lng.toFixed(4)}</p>}
        {launchBad && <p className="flex items-center gap-1.5 text-xs text-ark-coral"><AlertTriangle size={13} /> This launch point is in a flash-surge trap or already-flooded zone.</p>}
        {launchPl && <p className="flex items-center gap-1.5 text-xs text-ark-coral"><AlertTriangle size={13} /> Within 100 m of a reported downed powerline.</p>}
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Targets to inspect</p>
        <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {targets.length === 0 && <p className="text-sm text-slate-500">No targets yet. SOS, incidents and failing infrastructure appear here.</p>}
          {targets.map((t) => (
            <label key={t.id} className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${ids.has(t.id) ? "bg-ark-cyan/15" : "bg-white/5"}`}>
              <input type="checkbox" checked={ids.has(t.id)} onChange={() => toggle(t.id)} className="accent-ark-cyan" />
              <span className="min-w-0 flex-1 truncate">{t.label}</span>
              <span className="text-[11px] text-slate-500">{KIND[t.kind]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-[11px] text-slate-400">
        {[["speed", "Cruise (m/s)", 3, 20], ["endurance", "Flight time (min)", 5, 60], ["reserve", "Reserve (%)", 10, 60]].map(([k, l, lo, hi]) => (
          <label key={k}>{l}<input type="number" min={lo} max={hi} value={prm[k]} onChange={(e) => setPrm({ ...prm, [k]: Number(e.target.value) })} className="input-glass !mt-1 !py-1.5 !text-sm" /></label>
        ))}
      </div>

      <div className="space-y-2">
        <Button variant="ghost" onClick={fetchWind} disabled={wLoading} className="!px-3 !py-1.5 !text-xs">{wLoading ? <Loader2 size={13} className="animate-spin" /> : <Wind size={13} />} Check wind at launch</Button>
        {wind && (
          <div className="rounded-xl bg-white/5 p-3 text-xs">
            <p><b className={windVerdict.c}>{windVerdict.l}</b> · wind {wind.speed.toFixed(1)} m/s from {Math.round(wind.dir)}°, gusts {wind.gust.toFixed(1)} m/s{wind.rain > 0.2 ? ` · raining (${wind.rain} mm), and most small drones are not waterproof` : ""}</p>
            <p className="mt-1 text-slate-400">{windVerdict.t}</p>
          </div>
        )}
        {!wind && <p className="text-xs text-slate-500">Wind is not included in the plan until you check it.</p>}
      </div>

      <Button onClick={run} className="w-full"><Plane size={16} /> Plan flight</Button>

      {plan && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="font-display text-xl font-bold text-ark-cyan">{plan.order.length}</p><p className="text-[11px] text-slate-400">targets</p></div>
            <div><p className="font-display text-xl font-bold text-indigo-300">{fmtDistance(plan.distM)}</p><p className="text-[11px] text-slate-400">loop</p></div>
            <div><p className="font-display text-xl font-bold text-ark-cyan">{Math.ceil(plan.timeS / 60)} min</p><p className="text-[11px] text-slate-400">of {Math.floor(plan.budgetS / 60)} usable</p></div>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-300">{plan.order.map((t) => <li key={t.id}>{t.label}</li>)}</ol>
          {plan.dropped.length > 0 && <p className="text-xs text-indigo-300">Did not fit the battery: {plan.dropped.map((t) => t.label).join(", ")}. Use a second flight.</p>}
          {plan.order.some((t) => powerlines.some((p) => distanceM(t, p) <= 100)) && <p className="text-xs text-ark-coral">Some waypoints are within 100 m of a reported powerline. Keep altitude well clear and avoid low passes.</p>}
          <Button variant="ghost" onClick={download} className="w-full"><Download size={15} /> Download GPX</Button>
          <p className="text-[11px] text-slate-500">Straight-line legs, with wind applied approximately. It knows nothing about obstacles, terrain height, or airspace. Fly only in line with local aviation rules (for India, Digital Sky), keep visual line of sight, and set a safe altitude on site.</p>
        </div>
      )}
    </GlassCard>
  );
}