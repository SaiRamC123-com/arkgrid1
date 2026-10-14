import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, AlertTriangle, CheckCircle2, Radio } from "lucide-react";
import toast from "react-hot-toast";
import { opsApi } from "../../services/opsService";
import { safetyApi } from "../../services/simService";
import { acquireSocket, releaseSocket } from "../../services/socket";
import useLastFix from "../../hooks/useLastFix";
import { getMeta } from "../../offline/queue";
import { useAuth } from "../../context/AuthContext";
import { errMsg } from "../../utils/errMsg";
import { timeAgo } from "../../utils/geo";
import GlassCard from "../../components/ui/GlassCard";
import Loader from "../../components/ui/Loader";
import Badge from "../../components/ui/Badge";
import SafetyMap from "../../components/safety/SafetyMap";
import MissionGate from "../../components/safety/MissionGate";
import DronePlanner from "../../components/safety/DronePlanner";

const SEV = { critical: 90, high: 80, medium: 60, low: 40 };

export default function Safety() {
  const { profile } = useAuth();
  const { fix } = useLastFix(profile.uid);
  const gps = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const [ops, setOps] = useState(null);
  const [sim, setSim] = useState(null);
  const [simAt, setSimAt] = useState(null);
  const [published, setPublished] = useState(null);
  const [staging, setStaging] = useState(null);
  const [launch, setLaunch] = useState(null);
  const [pickMode, setPickMode] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [drone, setDrone] = useState(null);

  const load = useCallback(async () => {
    try { setOps(await opsApi.overview()); } catch (err) { toast.error(errMsg(err), { id: "sf-load" }); }
    safetyApi.scenario().then(setPublished).catch(() => {});
  }, []);

  useEffect(() => {
    getMeta(`sim_last_${profile.uid}`).then((c) => { if (c?.sim?.mode === "surge") { setSim(c.sim); setSimAt(c.at); } });
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    const s = acquireSocket();
    let x = null;
    const onInv = () => { clearTimeout(x); x = setTimeout(load, 500); };
    s.on("ops:invalidate", onInv);
    return () => { clearInterval(t); clearTimeout(x); s.off("ops:invalidate", onInv); releaseSocket(); };
  }, [load, profile.uid]);

  const targets = useMemo(() => {
    if (!ops) return [];
    return [
      ...ops.sos.filter((s) => s.location).map((s) => ({ id: `sos-${s.id}`, kind: "sos", label: `SOS: ${s.name}`, lat: s.location.lat, lng: s.location.lng, priority: 100 })),
      ...ops.incidents.filter((i) => i.centroid).map((i) => ({ id: `inc-${i.id}`, kind: "incident", label: `INC-${i.code}: ${i.title}`, lat: i.centroid.lat, lng: i.centroid.lng, priority: SEV[i.severity] || 50 })),
      ...ops.infra.filter((x) => x.status !== "operational").map((x) => ({ id: `inf-${x.id}`, kind: "infra", label: `${x.name} (${x.status})`, lat: x.lat, lng: x.lng, priority: x.status === "down" ? 70 : 50 })),
    ];
  }, [ops]);

  const onPick = (p) => {
    if (pickMode === "staging") setStaging(p);
    if (pickMode === "launch") setLaunch(p);
    setPickMode(null);
  };

  const safetyAlerts = ops ? ops.alerts.filter((a) => a.kind === "safety") : [];
  const byTeam = (id) => safetyAlerts.filter((a) => a.teamId === id);

  const fitPoints = [
    ...(sim ? [[sim.bounds.south, sim.bounds.west], [sim.bounds.north, sim.bounds.east]] : []),
    ...targets.map((t) => [t.lat, t.lng]),
    ...(gps ? [[gps.lat, gps.lng]] : []),
  ];

  if (!ops) return <Loader />;
  const powerlines = ops.hazards?.powerlines || [];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Drone <span className="text-gradient">&amp; Responder Safety</span></h1>
        <p className="mt-1 text-sm text-slate-400">Keep rescuers out of flash-surge traps, check ingress and egress, and plan drone scouting.</p>
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-ark-indigo/40 bg-ark-indigo/10 px-5 py-3 text-sm text-indigo-200">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" />
        <span>Decision support from reports and a scenario model. It cannot see everything on the ground, and it never replaces scouting, local knowledge, or the incident chief's call.</span>
      </div>

      <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          {sim ? <><b className="text-ark-cyan">Surge scenario loaded</b> <span className="text-slate-400">· +{sim.scenario.surge.height_m} m at {sim.scenario.surge.rise_m_per_h} m/h · run {timeAgo(new Date(simAt).toISOString())} · {sim.summary.trap_cells} trap cells</span></>
            : <span className="text-slate-300">No surge scenario loaded. <Link to="/command/simulator" className="font-semibold text-ark-cyan hover:underline">Run one in the Simulator</Link> to see trap zones and flood timing.</span>}
        </div>
        <div className="text-xs">
          {published?.published
            ? <span className="flex items-center gap-1.5 text-ark-cyan"><Radio size={13} className="animate-pulse" /> Live overlay published by {published.publishedByName}, until {new Date(published.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Responders are checked against it.</span>
            : <span className="text-slate-500">No live overlay. Teams are only checked against powerlines and road reports. A commander can publish the scenario from the Simulator.</span>}
        </div>
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <GlassCard className="overflow-hidden p-2">
            <SafetyMap sim={sim} teams={ops.teams} powerlines={powerlines} roads={ops.roads} targets={targets} routes={routes} drone={drone} launch={launch} staging={staging}
              gps={gps} picking={!!pickMode} onPick={onPick} fitPoints={fitPoints} fitKey={`${sim?.generated_at || "x"}-${targets.length}`} />
          </GlassCard>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-slate-400">
            <span><b className="text-ark-coral">■</b> Flash-surge trap</span><span><b className="text-indigo-300">■</b> Floods later / already wet</span><span><b className="text-ark-coral">◌</b> Powerline keep-clear (100 m)</span><span>Dashed roads = flooded or blocked reports</span>
          </div>

          <GlassCard>
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Radio size={18} className="text-ark-cyan" /> Responder proximity</h3>
            <div className="mt-3 space-y-2">
              {ops.teams.length === 0 && <p className="text-sm text-slate-500">No teams yet.</p>}
              {ops.teams.map((t) => {
                const al = byTeam(t.id);
                return (
                  <div key={t.id} className={`rounded-xl border px-4 py-3 text-sm ${al.some((a) => a.level === "critical") ? "border-ark-coral/60 bg-ark-coral/10" : al.length ? "border-ark-indigo/50 bg-ark-indigo/10" : "border-white/10 bg-white/5"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{t.name}</span>
                      {!t.location ? <Badge tone="indigo">No telemetry</Badge> : t.stale ? <Badge tone="coral">Stale</Badge> : al.length ? <Badge tone="coral">{al.length} warning{al.length > 1 ? "s" : ""}</Badge> : <Badge tone="cyan"><CheckCircle2 size={12} /> Clear</Badge>}
                    </div>
                    {al.map((a) => <p key={a.id} className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-200"><AlertTriangle size={13} className={`mt-0.5 shrink-0 ${a.level === "critical" ? "text-ark-coral" : "text-indigo-300"}`} /> {a.message}</p>)}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">Live alerts also appear on the Command Dashboard. Telemetry comes from responders who switched on location sharing.</p>
          </GlassCard>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <MissionGate targets={targets} teams={ops.teams} gps={gps} sim={sim} roads={ops.roads} powerlines={powerlines}
            staging={staging} setStaging={setStaging} pickMode={pickMode} onPickStaging={() => setPickMode((m) => (m === "staging" ? null : "staging"))} onRoutes={setRoutes} />
          <DronePlanner targets={targets} gps={gps} sim={sim} powerlines={powerlines} launch={launch} setLaunch={setLaunch}
            pickMode={pickMode} onPickLaunch={() => setPickMode((m) => (m === "launch" ? null : "launch"))} onPlan={setDrone} />
        </div>
      </div>
    </div>
  );
}