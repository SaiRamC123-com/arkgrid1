import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Database, Trash2, Scale, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { priorityApi } from "../../services/priorityService";
import { acquireSocket, releaseSocket } from "../../services/socket";
import useLastFix from "../../hooks/useLastFix";
import { KEYS, scoreOf, BANDS } from "../../utils/mcda";
import { SEV } from "../../components/incidents/incidentMeta";
import { timeAgo } from "../../utils/geo";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Loader from "../../components/ui/Loader";
import PriorityMap from "../../components/priority/PriorityMap";
import PriorityCard from "../../components/priority/PriorityCard";
import WeightPanel from "../../components/priority/WeightPanel";

export default function Priority() {
  const { profile } = useAuth();
  const isCommander = profile.role === "commander";
  const { fix } = useLastFix(profile.uid);
  const gps = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [weights, setWeights] = useState(null);
  const [filter, setFilter] = useState("needs");
  const [selectedId, setSelectedId] = useState(null);
  const [focus, setFocus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await priorityApi.get();
      setData(d);
      setError(null);
      setWeights((w) => w || { ...d.weights.weights });
    } catch (err) {
      setError(errMsg(err));
      setData((x) => x);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    const s = acquireSocket();
    let d = null;
    const onInv = () => { clearTimeout(d); d = setTimeout(load, 400); };
    s.on("ops:invalidate", onInv);
    return () => { clearInterval(t); clearTimeout(d); s.off("ops:invalidate", onInv); releaseSocket(); };
  }, [load]);

  const saved = data?.weights.weights;
  const dirty = !!(weights && saved && KEYS.some((k) => Math.abs(weights[k] - saved[k]) > 1e-6));

  const ranked = useMemo(() => {
    if (!data || !weights) return [];
    return data.ranking
      .map((r) => ({ ...r, score: scoreOf(r.criteria, weights) }))
      .sort((a, b) => b.score - a.score || SEV[b.severity].rank - SEV[a.severity].rank || (Date.parse(a.firstAt) || 0) - (Date.parse(b.firstAt) || 0))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [data, weights]);

  const list = ranked.filter((r) => filter === "all" || !r.assigned);
  const fitPoints = focus ? [[focus.lat, focus.lng]] : [...list.filter((i) => i.centroid).map((i) => [i.centroid.lat, i.centroid.lng]), ...(gps ? [[gps.lat, gps.lng]] : [])];
  const fitKey = focus ? `f${focus.key}` : `${list.length}-${filter}`;

  const act = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () => act(async () => { const r = await priorityApi.saveWeights(weights); setWeights(r.weights); }, "Shared weights saved");
  const reset = () => act(async () => { await priorityApi.resetWeights(); setWeights(null); }, "Weights reset to defaults");
  const onFocus = useCallback((p) => setFocus({ lat: p.lat, lng: p.lng, key: Date.now() }), []);

  if (!data || !weights) return <Loader />;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Rescue <span className="text-gradient">Priority</span></h1>
          <p className="mt-1 text-sm text-slate-400">
            {data.stats.open} open incidents · {data.stats.unassigned} without a team · updated {timeAgo(data.generatedAt)}
          </p>
        </div>
        {isCommander && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => act(() => priorityApi.seedDemo(), "Demo triage inputs loaded")} disabled={busy}><Database size={16} /> Load demo inputs</Button>
            <Button variant="ghost" onClick={() => act(() => priorityApi.clearDemo(), "Demo inputs cleared")} disabled={busy}><Trash2 size={16} /></Button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-ark-indigo/40 bg-ark-indigo/10 px-5 py-3 text-sm text-indigo-200">
        <Scale size={18} className="mt-0.5 shrink-0" />
        <span>Decision support only. This is a transparent weighted score, not a prediction of who will survive, and its weights are starting assumptions. The final call belongs to human incident chiefs.</span>
      </div>
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/50 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral"><AlertTriangle size={17} /> {error}. Showing the last data.</div>
      )}

      <WeightPanel weights={weights} setWeights={setWeights} saved={saved} defaults={data.defaults} custom={data.weights.custom} meta={data.weights}
        canEdit={isCommander} dirty={dirty} busy={busy} onSave={save} onReset={reset} />

      <div className="flex flex-wrap items-center gap-2">
        {[["needs", "Needs a team"], ["all", "All incidents"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${filter === k ? "border-ark-cyan bg-gradient-to-r from-ark-indigo/40 to-ark-cyan/30 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}>
            {l}
          </button>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {BANDS.map((b) => <span key={b.label} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: b.hex }} /> {b.label} ({b.min}+)</span>)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:order-2 lg:col-span-2">
          <GlassCard className="overflow-hidden p-2">
            <PriorityMap items={list} selectedId={selectedId} onSelect={setSelectedId} gps={gps} fitPoints={fitPoints} fitKey={fitKey} />
          </GlassCard>
          <p className="px-1 text-xs text-slate-500">
            Pin number = current rank. Assign teams from the <Link to="/command" className="font-semibold text-ark-cyan hover:underline">Command Dashboard</Link>, and review signals in <Link to="/command/incidents" className="font-semibold text-ark-cyan hover:underline">Incident Clusters</Link>.
          </p>
        </div>

        <div className="space-y-3 lg:order-1 lg:col-span-3 lg:max-h-[1100px] lg:overflow-y-auto lg:pr-1">
          {list.length === 0 ? (
            <GlassCard className="text-center text-sm text-slate-400">
              {ranked.length === 0 ? "No open incidents. They appear here as SOS and reports cluster." : "Every open incident already has a team."}
            </GlassCard>
          ) : (
            list.map((it) => (
              <PriorityCard key={it.id} it={it} weights={weights} previewing={dirty} selected={it.id === selectedId} busy={busy}
                onSelect={setSelectedId} onFocus={onFocus} onFlow={(id, f) => act(() => priorityApi.setFlow(id, f), f ? "Flow assessment saved" : "Flow assessment cleared")} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}