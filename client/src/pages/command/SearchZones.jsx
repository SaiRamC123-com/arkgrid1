import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Database, Trash2, PhoneOff, Target } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { searchApi } from "../../services/searchService";
import { acquireSocket, releaseSocket } from "../../services/socket";
import useLastFix from "../../hooks/useLastFix";
import { timeAgo } from "../../utils/geo";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Loader from "../../components/ui/Loader";
import ZoneMap from "../../components/search/ZoneMap";
import CaseForm from "../../components/search/CaseForm";
import CaseCard from "../../components/search/CaseCard";
import ZoneInfo from "../../components/search/ZoneInfo";

export default function SearchZones() {
  const { profile } = useAuth();
  const isCommander = profile.role === "commander";
  const { fix } = useLastFix(profile.uid);
  const gps = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [zone, setZone] = useState({ data: null, loading: false, error: null });
  const [form, setForm] = useState(null); // null | { prefill? }
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setData(await searchApi.list());
    } catch (err) {
      toast.error(errMsg(err), { id: "search-load" });
      setData((d) => d || { cases: [], candidates: [], contactLostMin: 20 });
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const s = acquireSocket();
    let d = null;
    const onInv = () => { clearTimeout(d); d = setTimeout(load, 400); };
    s.on("ops:invalidate", onInv);
    return () => { clearInterval(t); clearInterval(tick); clearTimeout(d); s.off("ops:invalidate", onInv); releaseSocket(); };
  }, [load]);

  const cases = data?.cases || [];
  const selected = cases.find((c) => c.id === selectedId && c.status === "active") || null;

  // Compute the zone when a case is selected (and again when it changes, and every 5 minutes)
  const computeZone = useCallback(async () => {
    if (!selectedId) return;
    setZone((z) => ({ ...z, loading: true, error: null }));
    try {
      setZone({ data: await searchApi.zone(selectedId), loading: false, error: null });
    } catch (err) {
      setZone((z) => ({ ...z, loading: false, error: errMsg(err) }));
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return setZone({ data: null, loading: false, error: null });
    computeZone();
    const t = setInterval(computeZone, 5 * 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.updatedAt, !!selected]);

  const fitPoints = useMemo(() => {
    if (zone.data && selected) {
      const outer = zone.data.zones.find((z) => z.p === 0.9)?.rings.flat() || [];
      return outer.length ? [...outer, [selected.lat, selected.lng]] : [[selected.lat, selected.lng]];
    }
    const active = cases.filter((c) => c.status === "active").map((c) => [c.lat, c.lng]);
    return active.length ? active : gps ? [[gps.lat, gps.lng]] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.data, selectedId, cases.length]);
  const fitKey = `${selectedId || "all"}-${zone.data?.generated_at || ""}-${cases.length}`;

  const act = async (fn, ok) => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast.success(ok);
      await load();
      return r;
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const create = async (body) => {
    const c = await act(() => searchApi.create(body), "Search case created");
    if (c) {
      setForm(null);
      setPicked(null);
      setSelectedId(c.id);
    }
  };

  const startFromCandidate = (c) => {
    const minAgo = Math.max(0, Math.round((Date.now() - Date.parse(c.lastContactAt)) / 60000));
    setPicked(c.location);
    setForm({ prefill: { sosId: c.sosId, name: c.name, situation: "stranded", minAgo } });
  };

  if (!data) return <Loader />;

  const hasDemo = cases.some((c) => c.demo);
  const sorted = [...cases].sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Probable <span className="text-gradient">Search Zones</span></h1>
          <p className="mt-1 text-sm text-slate-400">Where to search, from the last known location, time elapsed, terrain and water flow.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setForm({}); setPicked(null); setSelectedId(null); toast("Tap the map to set the last known location", { icon: "📍" }); }}><Plus size={16} /> New case</Button>
          {isCommander && (hasDemo
            ? <Button variant="ghost" onClick={() => act(() => searchApi.clearDemo(), "Demo cases cleared")} disabled={busy}><Trash2 size={16} /> Clear demo</Button>
            : <Button variant="ghost" onClick={() => gps ? act(() => searchApi.seedDemo(gps.lat, gps.lng), "Demo cases loaded") : toast.error("Waiting for your location")} disabled={busy}><Database size={16} /> Load demo cases</Button>)}
        </div>
      </div>

      {data.candidates.length > 0 && (
        <GlassCard className="border-ark-coral/50 shadow-glow-coral">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ark-coral"><PhoneOff size={18} /> Contact lost on {data.candidates.length} active SOS</h3>
          <p className="mt-1 text-xs text-slate-400">No update for over {data.contactLostMin} minutes. Open a search case to estimate where they may be.</p>
          <div className="mt-3 space-y-2">
            {data.candidates.map((c) => (
              <div key={c.sosId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm">
                <span>{c.name}{c.demo && <span className="ml-2 text-xs text-slate-400">(demo)</span>} · {c.peopleCount} {c.peopleCount > 1 ? "people" : "person"} · last contact {timeAgo(c.lastContactAt)}</span>
                <Button variant="ghost" onClick={() => startFromCandidate(c)} className="!px-3 !py-1.5 !text-xs"><Target size={14} /> Open case</Button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:order-2 lg:col-span-3">
          <GlassCard className="overflow-hidden p-2">
            <ZoneMap cases={cases} selectedId={selectedId} onSelect={setSelectedId} zone={selected ? zone.data : null} gps={gps}
              picking={!!form && !form.prefill?.sosId} picked={picked} onPick={setPicked} fitPoints={fitPoints} fitKey={fitKey} />
          </GlassCard>
          <div className="flex flex-wrap gap-4 px-1 text-xs text-slate-400">
            <span><b className="text-white">◉</b> Last known location</span>
            <span><b className="text-ark-coral">★</b> Model peak</span>
            <span><b className="text-ark-coral">■</b> 50% zone</span>
            <span><b className="text-indigo-300">■</b> 75%</span>
            <span><b className="text-ark-cyan">■</b> 90%</span>
          </div>

          {form ? (
            <CaseForm key={form.prefill?.sosId || "new"} coords={picked} prefill={form.prefill} gps={gps}
              onUseGps={() => gps && setPicked(gps)} onSubmit={create} onCancel={() => { setForm(null); setPicked(null); }} />
          ) : selected ? (
            <ZoneInfo zone={zone.data} loading={zone.loading} error={zone.error} onRefresh={computeZone} />
          ) : null}
        </div>

        <div className="space-y-3 lg:order-1 lg:col-span-2 lg:max-h-[1100px] lg:overflow-y-auto lg:pr-1">
          {sorted.length === 0 ? (
            <GlassCard className="text-center text-sm text-slate-400">No search cases. Create one for someone who is missing, or load demo cases.</GlassCard>
          ) : (
            sorted.map((c) => (
              <CaseCard key={c.id} c={c} now={now} selected={c.id === selectedId} onSelect={(id) => !form && setSelectedId(id)}
                isCommander={isCommander} busy={busy}
                onUpdate={(id, body) => act(() => searchApi.update(id, body))}
                onDelete={(id) => { act(() => searchApi.remove(id), "Case deleted"); if (id === selectedId) setSelectedId(null); }} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}