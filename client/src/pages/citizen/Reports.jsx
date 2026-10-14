import { useMemo, useState } from "react";
import { Plus, WifiOff, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { reportApi } from "../../services/reportService";
import useCachedList from "../../hooks/useCachedList";
import useLastFix from "../../hooks/useLastFix";
import { distanceM, timeAgo } from "../../utils/geo";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Loader from "../../components/ui/Loader";
import ReportMap from "../../components/reports/ReportMap";
import ReportCard from "../../components/reports/ReportCard";
import ReportForm from "../../components/reports/ReportForm";
import { REPORT_TYPES } from "../../components/reports/reportMeta";

const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick}
    className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
      active ? "border-ark-cyan bg-gradient-to-r from-ark-indigo/40 to-ark-cyan/30 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
    }`}>
    {children}
  </button>
);

export default function Reports() {
  const { profile } = useAuth();
  const isStaff = profile.role !== "citizen";
  const { data, offline, error, staleAt, reload, patch } = useCachedList(`reports_${profile.uid}`, reportApi.list, 15000);
  const { fix } = useLastFix(profile.uid);
  const userPos = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const [statusF, setStatusF] = useState("all");
  const [typeF, setTypeF] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const list = useMemo(
    () =>
      (data || [])
        .filter((r) => r.status !== "rejected")
        .filter((r) => statusF === "all" || r.status === statusF)
        .filter((r) => typeF === "all" || r.type === typeF)
        .map((r) => ({ ...r, dist: userPos ? distanceM(userPos, r) : null }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [data, statusF, typeF, userPos]
  );

  const selected = list.find((r) => r.id === selectedId) || null;
  const fitPoints = selected
    ? [[selected.lat, selected.lng], ...(userPos ? [[userPos.lat, userPos.lng]] : [])]
    : [...list.map((r) => [r.lat, r.lng]), ...(userPos ? [[userPos.lat, userPos.lng]] : [])];
  const fitKey = `${selectedId || "all"}-${list.length}-${userPos ? 1 : 0}`;

  const act = async (id, fn, okMsg) => {
    setBusyId(id);
    try {
      patch(await fn());
      if (okMsg) toast.success(okMsg);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusyId(null);
    }
  };
  const onConfirm = (id) => act(id, () => reportApi.confirm(id), "Thanks. Your confirmation helps responders");
  const onStatus = (id, status) => act(id, () => reportApi.setStatus(id, status), `Marked ${status}`);

  if (!data) return <Loader />;

  const open = (data || []).filter((r) => ["unverified", "verified"].includes(r.status));
  const formCoords = picked || userPos;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Crowd <span className="text-gradient">Reports</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {open.filter((r) => r.status === "verified").length} verified · {open.filter((r) => r.status === "unverified").length} waiting for confirmation
          </p>
        </div>
        <Button onClick={() => { setFormOpen(true); setSelectedId(null); }}><Plus size={16} /> Report hazard</Button>
      </div>
{error && (
  <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/50 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral">
    <AlertTriangle size={17} /> Server error: {error}
  </div>
)}
      {offline && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/50 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral">
          <WifiOff size={17} /> Offline. Showing saved reports{staleAt ? ` from ${timeAgo(new Date(staleAt).toISOString())}` : ""}. You need a connection to send or confirm.
        </div>
      )}

      <GlassCard className="flex flex-wrap items-center gap-2 p-4">
        {[["all", "All"], ["verified", "Verified"], ["unverified", "Unverified"]].map(([k, l]) => (
          <Chip key={k} active={statusF === k} onClick={() => setStatusF(k)}>{l}</Chip>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
        <Chip active={typeF === "all"} onClick={() => setTypeF("all")}>All types</Chip>
        {Object.entries(REPORT_TYPES).map(([k, v]) => (
          <Chip key={k} active={typeF === k} onClick={() => setTypeF(k)}>{v.label}</Chip>
        ))}
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:order-2 lg:col-span-3">
          <GlassCard className="overflow-hidden p-2">
            <ReportMap
              reports={list}
              selectedId={selectedId}
              onSelect={(id) => !formOpen && setSelectedId(id)}
              userPos={userPos}
              picking={formOpen}
              picked={picked}
              onPick={setPicked}
              fitPoints={fitPoints}
              fitKey={fitKey}
            />
          </GlassCard>
          <div className="flex flex-wrap gap-4 px-1 text-xs text-slate-400">
            <span><b className="text-ark-coral">●</b> High danger</span>
            <span><b className="text-ark-cyan">●</b> Verified</span>
            <span><b className="text-indigo-300">●</b> Unverified (dashed)</span>
            <span><b className="text-slate-500">●</b> Resolved</span>
          </div>
          {formOpen && (
            <ReportForm
              coords={formCoords}
              onCancel={() => { setFormOpen(false); setPicked(null); }}
              onDone={() => { setFormOpen(false); setPicked(null); reload(); }}
            />
          )}
        </div>

        <div className="space-y-3 lg:order-1 lg:col-span-2 lg:max-h-[1100px] lg:overflow-y-auto lg:pr-1">
          {list.length === 0 ? (
            <GlassCard className="text-center text-sm text-slate-400">No reports match. Be the first to report a hazard.</GlassCard>
          ) : (
            list.map((r) => (
              <ReportCard key={r.id} r={r} selected={r.id === selectedId} onSelect={(id) => !formOpen && setSelectedId(id)}
                isStaff={isStaff} busy={busyId === r.id} onConfirm={onConfirm} onStatus={onStatus} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}