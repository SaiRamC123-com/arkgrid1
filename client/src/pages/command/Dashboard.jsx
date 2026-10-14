import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Wifi, WifiOff, Database, Trash2, Maximize2, Volume2, VolumeX, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { opsApi } from "../../services/opsService";
import { acquireSocket, releaseSocket } from "../../services/socket";
import useLastFix from "../../hooks/useLastFix";
import { getMeta } from "../../offline/queue";
import { beep } from "../../utils/alertSound";
import { errMsg } from "../../utils/errMsg";
import { timeAgo } from "../../utils/geo";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Loader from "../../components/ui/Loader";
import OpsMap from "../../components/ops/OpsMap";
import StatTiles from "../../components/ops/StatTiles";
import AlertFeed from "../../components/ops/AlertFeed";
import SOSPanel from "../../components/ops/SOSPanel";
import TeamPanel from "../../components/ops/TeamPanel";
import InfraPanel from "../../components/ops/InfraPanel";
import LogisticsGlance from "../../components/ops/LogisticsGlance";
import IncidentCard from "../../components/incidents/IncidentCard";
import { SEV } from "../../components/incidents/incidentMeta";

const LAYERS = [["sos", "SOS"], ["incidents", "Incidents"], ["teams", "Teams"], ["infra", "Infrastructure"], ["shelters", "Facilities"], ["roads", "Roads"], ["risk", "Flood risk"]];
const TITLE = "ArkGrid | Flood Response Intelligence";

export default function Dashboard() {
  const { profile } = useAuth();
  const isCommander = profile.role === "commander";
  const { fix } = useLastFix(profile.uid);
  const gps = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [layers, setLayers] = useState({ sos: true, incidents: true, teams: true, infra: true, shelters: true, roads: true, risk: false });
  const [risk, setRisk] = useState(null);
  const [focus, setFocus] = useState(null);
  const [fitTick, setFitTick] = useState(0);
  const [pick, setPick] = useState(null); // null | { point }
  const [muted, setMuted] = useState(() => localStorage.getItem("ark_mute") === "1");
  const [busy, setBusy] = useState(false);

  const posRef = useRef({});
  const seenSOS = useRef(null);
  const seenAlerts = useRef(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const mapRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await opsApi.overview();
      // keep newer live positions that arrived over the socket
      d.teams = d.teams.map((t) => {
        const p = posRef.current[t.id];
        const tl = t.locationAt ? Date.parse(t.locationAt) : 0;
        return p && Date.parse(p.at) > tl ? { ...t, location: p.location, locationAt: p.at, stale: false } : t;
      });

      if (seenSOS.current) {
        d.sos.filter((s) => !seenSOS.current.has(s.id)).forEach((s) => {
          toast.error(`New SOS: ${s.name}`, { icon: "🚨", duration: 9000 });
          if (!mutedRef.current) beep("sos");
          navigator.vibrate?.([200, 100, 200]);
        });
      }
      seenSOS.current = new Set(d.sos.map((s) => s.id));

      if (seenAlerts.current) {
        const fresh = d.alerts.filter((a) => a.level === "critical" && !seenAlerts.current.has(a.id));
        fresh.slice(0, 2).forEach((a) => toast(a.message, { icon: "⚠️", duration: 7000 }));
        if (fresh.length && !mutedRef.current) beep("alert");
      }
      seenAlerts.current = new Set(d.alerts.map((a) => a.id));

      setData(d);
      setError(null);
    } catch (err) {
      setError(errMsg(err));
      setData((x) => x);
    }
  }, []);

  // Live channel
  useEffect(() => {
    const s = acquireSocket();
    setConnected(s.connected);
    let t = null;
    const onConnect = () => { setConnected(true); load(); };
    const onDisconnect = () => setConnected(false);
    const onInvalidate = () => { clearTimeout(t); t = setTimeout(load, 400); };
    const onPos = (p) => {
      posRef.current[p.id] = p;
      setData((d) => d && { ...d, teams: d.teams.map((x) => (x.id === p.id ? { ...x, location: p.location, locationAt: p.at, stale: false } : x)) });
    };
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("ops:invalidate", onInvalidate);
    s.on("team:pos", onPos);
    return () => {
      clearTimeout(t);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("ops:invalidate", onInvalidate);
      s.off("team:pos", onPos);
      releaseSocket();
    };
  }, [load]);

  // Safety net: poll slowly when live, quickly when the socket is down
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), connected ? 30000 : 8000);
    return () => clearInterval(t);
  }, [load, connected]);

  // Saved flood-risk analysis (from the Flood Risk page) as an optional layer
  useEffect(() => {
    getMeta(`risk_last_${profile.uid}`).then((c) => c?.data && setRisk({ ...c.data, savedAt: c.at }));
  }, [profile.uid]);

  const sosCount = data?.sos.length || 0;
  useEffect(() => {
    document.title = sosCount ? `(${sosCount} SOS) ArkGrid Command` : TITLE;
    return () => { document.title = TITLE; };
  }, [sosCount]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    localStorage.setItem("ark_mute", m ? "1" : "0");
    if (!m) beep("alert");
  };

  const onFocus = useCallback((p) => {
    setFocus({ lat: p.lat, lng: p.lng, key: Date.now() });
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const seed = async () => {
    if (!gps) return toast.error("Waiting for your location to place demo data around you");
    setBusy(true);
    try {
      const r = await opsApi.seedDemo(gps.lat, gps.lng);
      toast.success(`Loaded ${r.created} demo teams and infrastructure`);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!window.confirm("Remove demo teams and infrastructure?")) return;
    setBusy(true);
    try {
      await opsApi.clearDemo();
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const fitPoints = useMemo(() => {
    if (focus) return [[focus.lat, focus.lng]];
    if (!data) return [];
    return [
      ...data.sos.filter((s) => s.location).map((s) => [s.location.lat, s.location.lng]),
      ...data.incidents.filter((i) => i.centroid).map((i) => [i.centroid.lat, i.centroid.lng]),
      ...data.teams.filter((t) => t.location).map((t) => [t.location.lat, t.location.lng]),
      ...data.infra.map((x) => [x.lat, x.lng]),
      ...data.shelters.items.map((s) => [s.lat, s.lng]),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, fitTick, !!data]);
  const fitKey = focus ? `f${focus.key}` : data ? `all${fitTick}` : "none";

  if (!data) return <Loader />;

  const topIncidents = [...data.incidents]
    .sort((a, b) => SEV[b.severity].rank - SEV[a.severity].rank || new Date(b.lastAt) - new Date(a.lastAt))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Command <span className="text-gradient">Dashboard</span></h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
            <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${connected ? "border-ark-cyan/50 bg-ark-cyan/10 text-ark-cyan" : "border-ark-coral/50 bg-ark-coral/10 text-ark-coral"}`}>
              {connected ? <Wifi size={13} /> : <WifiOff size={13} />} {connected ? "Live" : "Reconnecting"}
            </span>
            Updated {timeAgo(data.serverTime)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={toggleMute} title="Alert sound">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</Button>
          {isCommander && (data.flags.demoLoaded
            ? <Button variant="ghost" onClick={clear} disabled={busy}><Trash2 size={16} /> Clear demo ops</Button>
            : <Button onClick={seed} disabled={busy}><Database size={16} /> Load demo ops data</Button>)}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/50 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral">
          <AlertTriangle size={17} /> {error}. Showing the last data.
        </div>
      )}

      <StatTiles data={data} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div ref={mapRef} className="space-y-3 lg:col-span-3">
          <div className="flex flex-wrap items-center gap-2">
            {LAYERS.map(([k, l]) => {
              const disabled = k === "risk" && !risk;
              return (
                <button key={k} disabled={disabled} title={disabled ? "Run Flood Risk first" : undefined}
                  onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                    layers[k] ? "border-ark-cyan bg-gradient-to-r from-ark-indigo/40 to-ark-cyan/30 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                  }`}>
                  {l}
                </button>
              );
            })}
            <button onClick={() => { setFocus(null); setFitTick((t) => t + 1); }} className="ml-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold hover:bg-white/10">
              <Maximize2 size={13} /> Fit all
            </button>
          </div>
          <GlassCard className="overflow-hidden p-2">
            <OpsMap data={data} layers={layers} risk={risk} gps={gps} picking={!!pick} picked={pick?.point}
              onPick={(p) => setPick({ point: p })} fitPoints={fitPoints} fitKey={fitKey} />
          </GlassCard>
          <p className="px-1 text-xs text-slate-500">
            {layers.risk && risk ? `Flood-risk layer is your saved analysis from ${timeAgo(new Date(risk.savedAt).toISOString())}. It is a prototype model, not validated. ` : ""}
            Pins: red ! = SOS, number = incident signals, letters = teams (round) and infrastructure (square). Dashed roads are unverified.
          </p>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <AlertFeed alerts={data.alerts} onFocus={onFocus} />
          <SOSPanel sos={data.sos} onFocus={onFocus} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TeamPanel teams={data.teams} incidents={data.incidents} me={data.me} isCommander={isCommander} onChanged={load} onFocus={onFocus} />
        <InfraPanel infra={data.infra} isCommander={isCommander} onChanged={load} onFocus={onFocus} gps={gps}
          pick={pick} onStartPick={() => { setPick({ point: null }); toast("Tap the map to place it", { icon: "📍" }); }} onEndPick={() => setPick(null)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">Top incidents</h3>
            <Link to="/command/incidents" className="text-xs font-semibold text-ark-cyan hover:underline">Manage all</Link>
          </div>
          <div className="mt-4 space-y-3">
            {topIncidents.length === 0 && <p className="text-sm text-slate-500">No open incidents.</p>}
            {topIncidents.map((i) => (
              <IncidentCard key={i.id} i={i} selected={false} onSelect={() => i.centroid && onFocus(i.centroid)} />
            ))}
          </div>
        </GlassCard>
        <LogisticsGlance shelters={data.shelters} />
      </div>
    </div>
  );
}