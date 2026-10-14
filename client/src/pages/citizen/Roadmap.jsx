import { useMemo, useState } from "react";
import { Plus, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { roadApi } from "../../services/roadService";
import useCachedList from "../../hooks/useCachedList";
import useLastFix from "../../hooks/useLastFix";
import { timeAgo } from "../../utils/geo";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Loader from "../../components/ui/Loader";
import RoadLayerMap from "../../components/roads/RoadLayerMap";
import RoadEditor from "../../components/roads/RoadEditor";
import RoadCard from "../../components/roads/RoadCard";
import { ROAD_STATUS } from "../../components/roads/roadMeta";

export default function RoadMap() {
  const { profile } = useAuth();
  const isStaff = profile.role !== "citizen";
  const { data, offline, staleAt, reload, patch } = useCachedList("roads", roadApi.list, 20000);
  const { fix } = useLastFix(profile.uid);
  const userPos = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedId, setSelectedId] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [draftStatus, setDraftStatus] = useState("flooded");
  const [busyId, setBusyId] = useState(null);

  const roads = data || [];
  const selected = roads.find((r) => r.id === selectedId) || null;
  const list = useMemo(
    () => [...roads].sort((a, b) => Number(a.stale) - Number(b.stale) || new Date(b.updatedAt) - new Date(a.updatedAt)),
    [roads]
  );

  const pts = (rs) => rs.flatMap((r) => r.coords.map((p) => [p.lat, p.lng]));
  const fitPoints = selected ? pts([selected]) : [...pts(roads), ...(userPos ? [[userPos.lat, userPos.lng]] : [])];
  const fitKey = `${selectedId || "all"}-${roads.length}-${userPos ? 1 : 0}`;
  const count = (s) => roads.filter((r) => r.status === s && !r.stale).length;

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

  const submit = async (body) => {
    try {
      const road = await roadApi.create(body);
      toast.success(road.verified ? "Road status published" : "Road marked. It stays Unverified until others confirm it", { duration: 5000 });
      setDrawing(false);
      setDraft([]);
      setSelectedId(road.id);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this road report?")) return;
    try {
      await roadApi.remove(id);
      setSelectedId(null);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  if (!data) return <Loader />;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Road <span className="text-gradient">Accessibility</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Live passable, flooded, and blocked roads. Updates older than 12 h fade out.</p>
        </div>
        <Button onClick={() => { setDrawing(true); setSelectedId(null); toast("Tap the map along the road", { icon: "📍" }); }}>
          <Plus size={16} /> Mark a road
        </Button>
      </div>

      {offline && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/50 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral">
          <WifiOff size={17} /> Offline. Showing saved roads{staleAt ? ` from ${timeAgo(new Date(staleAt).toISOString())}` : ""}.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {Object.entries(ROAD_STATUS).map(([k, m]) => (
          <GlassCard key={k} className="p-4 text-center">
            <p className="font-display text-3xl font-bold" style={{ color: m.hex }}>{count(k)}</p>
            <p className="text-xs text-slate-400">{m.label}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:order-2 lg:col-span-3">
          <GlassCard className="overflow-hidden p-2">
            <RoadLayerMap
              roads={roads}
              selectedId={selectedId}
              onSelect={setSelectedId}
              userPos={userPos}
              draft={draft}
              draftHex={ROAD_STATUS[draftStatus].hex}
              drawing={drawing}
              onAddPoint={(p) => setDraft((d) => (d.length >= 40 ? d : [...d, p]))}
              fitPoints={fitPoints}
              fitKey={fitKey}
            />
          </GlassCard>
          <p className="px-1 text-xs text-slate-500">Dashed lines are unverified. Faded lines are outdated. These are citizen and responder reports and may be incomplete.</p>
          {drawing && (
            <RoadEditor
              points={draft}
              status={draftStatus}
              setStatus={setDraftStatus}
              onUndo={() => setDraft((d) => d.slice(0, -1))}
              onClear={() => setDraft([])}
              onSubmit={submit}
              onCancel={() => { setDrawing(false); setDraft([]); }}
            />
          )}
        </div>

        <div className="space-y-3 lg:order-1 lg:col-span-2 lg:max-h-[1100px] lg:overflow-y-auto lg:pr-1">
          {list.length === 0 ? (
            <GlassCard className="text-center text-sm text-slate-400">No road reports yet. Mark a flooded or blocked road to warn others.</GlassCard>
          ) : (
            list.map((r) => (
              <RoadCard key={r.id} r={r} selected={r.id === selectedId} onSelect={(id) => !drawing && setSelectedId(id)}
                isStaff={isStaff} busy={busyId === r.id}
                onConfirm={(id) => act(id, () => roadApi.confirm(id), "Thanks for confirming")}
                onSetStatus={(id, status) => act(id, () => roadApi.update(id, { status }), "Road status updated")}
                onRefresh={(id) => act(id, () => roadApi.update(id, {}), "Road report refreshed")}
                onDelete={remove} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}