import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Database, Trash2, TrendingDown, Layers, Cpu, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { incidentApi } from "../../services/incidentService";
import useLastFix from "../../hooks/useLastFix";
import { timeAgo } from "../../utils/geo";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Loader from "../../components/ui/Loader";
import IncidentMap from "../../components/incidents/IncidentMap";
import IncidentCard from "../../components/incidents/IncidentCard";
import IncidentDetail from "../../components/incidents/IncidentDetail";
import { SEV, ENGINE } from "../../components/incidents/incidentMeta";

const FILTERS = [["all", "All"], ["new", "New"], ["acknowledged", "Acknowledged"], ["dispatched", "Dispatched"]];

export default function Incidents() {
  const { profile } = useAuth();
  const isCommander = profile.role === "commander";
  const { fix } = useLastFix(profile.uid);
  const userPos = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [members, setMembers] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await incidentApi.list());
      setOffline(false);
    } catch {
      setOffline(true);
      setData((d) => d || { incidents: [], stats: null });
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const incidents = data?.incidents || [];
  const stats = data?.stats;
  const selected = incidents.find((i) => i.id === selectedId) || null;

  const list = useMemo(
    () =>
      incidents
        .filter((i) => filter === "all" || i.ops === filter)
        .sort(
          (a, b) =>
            Number(a.ops === "dispatched") - Number(b.ops === "dispatched") ||
            SEV[b.severity].rank - SEV[a.severity].rank ||
            new Date(b.lastAt) - new Date(a.lastAt)
        ),
    [incidents, filter]
  );

  // Load members when the selection (or its data) changes
  useEffect(() => {
    if (!selectedId) return setMembers(null);
    let alive = true;
    incidentApi.get(selectedId).then((r) => alive && setMembers(r.members)).catch(() => alive && setMembers([]));
    return () => { alive = false; };
  }, [selectedId, selected?.updatedAt]);

  const located = list.filter((i) => i.centroid);
  const fitPoints = selected?.centroid
    ? [[selected.centroid.lat, selected.centroid.lng]]
    : located.map((i) => [i.centroid.lat, i.centroid.lng]);
  const fitKey = `${selectedId || "all"}-${located.length}`;

  const applyOps = async (body) => {
    setBusy(true);
    try {
      await incidentApi.setOps(selectedId, body);
      toast.success(body.ops ? `Marked ${body.ops}` : "Note saved");
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const recluster = async () => {
    setBusy(true);
    try {
      const r = await incidentApi.recluster();
      r.skipped ? toast("Clustering is already running") : toast.success(`${r.signals} signals → ${r.incidents} incidents`);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const seed = async () => {
    if (!userPos) return toast.error("Waiting for your location to place demo data around you");
    setBusy(true);
    try {
      const r = await incidentApi.seedDemo(userPos.lat, userPos.lng);
      toast.success(`Loaded ${r.created} demo signals. Clustering…`);
      setTimeout(load, 2500);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!window.confirm("Remove all demo reports and SOS?")) return;
    setBusy(true);
    try {
      await incidentApi.clearDemo();
      setSelectedId(null);
      setTimeout(load, 2500);
      toast.success("Demo data cleared");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Loader />;

  const eng = ENGINE[stats?.engine] || { label: "Waiting for first run", ok: true };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Incident <span className="text-gradient">Clusters</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Scattered SOS and reports grouped into single actionable incidents.</p>
        </div>
        {isCommander && (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={recluster} disabled={busy}><RefreshCw size={16} /> Re-run</Button>
            {stats?.demoLoaded
              ? <Button variant="ghost" onClick={clear} disabled={busy}><Trash2 size={16} /> Clear demo</Button>
              : <Button onClick={seed} disabled={busy}><Database size={16} /> Load demo burst</Button>}
          </div>
        )}
      </div>

      {(offline || stats?.ok === false) && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/50 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral">
          <AlertTriangle size={17} /> {offline ? "Cannot reach the server. Showing the last data." : "The last clustering run failed. Showing the previous result."}
        </div>
      )}
      {stats && !eng.ok && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-indigo/50 bg-ark-indigo/10 px-5 py-3 text-sm text-indigo-200">
          <Cpu size={17} /> The ML service is offline, so simplified distance-and-time grouping is being used. Nothing is lost.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GlassCard className="p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Raw signals</p>
          <p className="mt-1 font-display text-3xl font-bold text-indigo-300">{stats?.signals ?? 0}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Incidents</p>
          <p className="mt-1 flex items-center gap-2 font-display text-3xl font-bold text-ark-cyan"><Layers size={22} /> {stats?.incidents ?? 0}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Dispatch load</p>
          <p className="mt-1 flex items-center gap-2 font-display text-3xl font-bold text-ark-coral"><TrendingDown size={22} /> −{stats?.reductionPct ?? 0}%</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Engine</p>
          <p className="mt-1 text-sm font-semibold">{eng.label}</p>
          <p className="text-xs text-slate-500">{stats?.lastRunAt ? `Run ${timeAgo(stats.lastRunAt)}` : "No run yet"}</p>
        </GlassCard>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              filter === k ? "border-ark-cyan bg-gradient-to-r from-ark-indigo/40 to-ark-cyan/30 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
            }`}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:order-2 lg:col-span-3">
          <GlassCard className="overflow-hidden p-2">
            <IncidentMap incidents={list} selectedId={selectedId} onSelect={setSelectedId} userPos={userPos} fitPoints={fitPoints} fitKey={fitKey} />
          </GlassCard>
          <p className="px-1 text-xs text-slate-500">
            Number = signals in the incident. Circle = spread of those signals. Clusters are decision support. Always verify before dispatching.
          </p>
          {selected && (
            <IncidentDetail key={selected.id} incident={selected} members={members} busy={busy} onOps={applyOps} onClose={() => setSelectedId(null)} />
          )}
        </div>

        <div className="space-y-3 lg:order-1 lg:col-span-2 lg:max-h-[1100px] lg:overflow-y-auto lg:pr-1">
          {list.length === 0 ? (
            <GlassCard className="text-center text-sm text-slate-400">
              {incidents.length === 0 ? "No open incidents. New SOS and reports will cluster here automatically." : "No incidents match this filter."}
            </GlassCard>
          ) : (
            list.map((i) => <IncidentCard key={i.id} i={i} selected={i.id === selectedId} onSelect={setSelectedId} />)
          )}
        </div>
      </div>
    </div>
  );
}