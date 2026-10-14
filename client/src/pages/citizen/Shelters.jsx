import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, WifiOff, Database, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { shelterApi } from "../../services/shelterService";
import useShelters from "../../hooks/useShelters";
import useLastFix from "../../hooks/useLastFix";
import { getMeta, setMeta } from "../../offline/queue";
import { distanceM, timeAgo } from "../../utils/geo";
import { fetchRoute, straightRoute } from "../../utils/routing";
import { boundsFromPoints, prefetchTiles, tileUrls } from "../../utils/tiles";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Loader from "../../components/ui/Loader";
import ShelterMap from "../../components/shelters/ShelterMap";
import ShelterCard from "../../components/shelters/ShelterCard";
import ShelterDetail from "../../components/shelters/ShelterDetail";
import ShelterEditor from "../../components/shelters/ShelterEditor";
import { TYPE_META } from "../../components/shelters/shelterMeta";
import useCachedList from "../../hooks/useCachedList";
import { roadApi } from "../../services/roadService";
import { routeHazards } from "../../utils/geo";
const routeKey = (id, mode) => `route_${id}_${mode}`;

export default function Shelters() {
  const { profile } = useAuth();
  const canManage = profile.role !== "citizen";
  const isCommander = profile.role === "commander";

  const { shelters, offline, staleAt, reload, patchLocal } = useShelters();
  const { fix } = useLastFix(profile.uid);
  const { data: roads } = useCachedList("roads", roadApi.list, 30000);
  const userPos = useMemo(() => (fix ? { lat: fix.lat, lng: fix.lng } : null), [fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const [type, setType] = useState("all");
  const [onlyAvail, setOnlyAvail] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("walking");
  const [route, setRoute] = useState(null);
  const [saving, setSaving] = useState(null);
  const [editor, setEditor] = useState(null); // null | {mode:"add"} | {mode:"edit", id}
  const [picked, setPicked] = useState(null);
  const detailRef = useRef(null);

  const list = useMemo(() => {
    if (!shelters) return [];
    const q = query.trim().toLowerCase();
    return shelters
      .filter((s) => type === "all" || s.type === type)
      .filter((s) => !onlyAvail || ["open", "limited"].includes(s.availability))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q))
      .map((s) => ({ ...s, dist: userPos ? distanceM(userPos, s) : null }))
      .sort((a, b) => (a.dist != null && b.dist != null ? a.dist - b.dist : a.name.localeCompare(b.name)));
  }, [shelters, type, onlyAvail, query, userPos]);

  const selected = list.find((s) => s.id === selectedId) || null;

  // Load a previously saved route for this facility + mode
  useEffect(() => {
    setRoute(null);
    if (!selectedId) return;
    let alive = true;
    getMeta(routeKey(selectedId, mode)).then((c) => alive && c && setRoute({ data: c, saved: true }));
    return () => { alive = false; };
  }, [selectedId, mode]);

  useEffect(() => {
    if (selectedId) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  /* ---------- Map fitting ---------- */
  const fitPoints = route?.data?.coords?.length
    ? route.data.coords
    : selected
      ? [[selected.lat, selected.lng], ...(userPos ? [[userPos.lat, userPos.lng]] : [])]
      : [...list.map((s) => [s.lat, s.lng]), ...(userPos ? [[userPos.lat, userPos.lng]] : [])];
  const fitKey = `${selectedId || "all"}-${route?.data?.savedAt || 0}-${shelters?.length || 0}-${userPos ? 1 : 0}`;

  /* ---------- Routing ---------- */
  const getRoute = async () => {
    if (!selected || !userPos) return;
    setRoute({ loading: true, data: route?.data });
    const key = routeKey(selected.id, mode);
    try {
      const data = await fetchRoute(userPos, selected, mode);
      setRoute({ data });
      setMeta(key, data);
    } catch {
      const cached = await getMeta(key);
      if (cached) {
        setRoute({ data: cached, saved: true });
        toast("Routing unavailable. Showing your saved route", { icon: "💾" });
      } else {
        setRoute({ data: straightRoute(userPos, selected, mode) });
        toast("Routing unavailable. Showing a straight-line estimate", { icon: "📡" });
      }
    }
  };

  const saveOffline = async () => {
    if (!selected || !userPos) return;
    if (!navigator.onLine) return toast.error("Go online to download this area");
    setSaving({ done: 0, total: 1 });
    try {
      let data = route?.data && !route.data.approx ? route.data : null;
      if (!data) {
        try {
          data = await fetchRoute(userPos, selected, mode);
          setMeta(routeKey(selected.id, mode), data);
          setRoute({ data });
        } catch {
          toast("Route not available, saving the map area only", { icon: "ℹ️" });
        }
      }
      const pts = data ? data.coords : [[userPos.lat, userPos.lng], [selected.lat, selected.lng]];
      const urls = tileUrls(boundsFromPoints(pts));
      const r = await prefetchTiles(urls, (done, total) => setSaving({ done, total }));
      if (r.ok === 0) throw new Error("Map tiles could not be downloaded");
      toast.success(`Saved ${data ? "route and " : ""}${r.ok} map tiles for offline use`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(null);
    }
  };

  /* ---------- Manage (responder / commander) ---------- */
  const adjust = async (delta) => {
    try {
      const { shelter } = await shelterApi.adjust(selected.id, delta);
      patchLocal(shelter);
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const saveFacility = async (payload) => {
    try {
      if (editor.mode === "add") {
        const { shelter } = await shelterApi.create(payload);
        setSelectedId(shelter.id);
        toast.success("Facility added");
      } else {
        await shelterApi.update(editor.id, payload);
        toast.success("Facility updated");
      }
      setEditor(null);
      setPicked(null);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };
  const hazards = useMemo(
  () => (route?.data && !route.data.approx && roads ? routeHazards(route.data.coords, roads) : null),
  [route, roads]
);

  const removeFacility = async () => {
    if (!window.confirm(`Remove "${selected.name}"?`)) return;
    try {
      await shelterApi.remove(selected.id);
      toast.success("Facility removed");
      setEditor(null);
      setPicked(null);
      setSelectedId(null);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const seedDemo = async () => {
    if (!userPos) return toast.error("Waiting for your location to place demo data around you");
    try {
      const r = await shelterApi.seed(userPos.lat, userPos.lng);
      toast.success(`Loaded ${r.created} demo facilities`);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const clearDemo = async () => {
    if (!window.confirm("Remove all demo facilities?")) return;
    try {
      await shelterApi.clearDemo();
      setSelectedId(null);
      reload();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const startAdd = () => {
    setSelectedId(null);
    setPicked(null);
    setEditor({ mode: "add" });
    toast("Tap the map to place the facility", { icon: "📍" });
  };

  const startEdit = () => {
    setPicked(null);
    setEditor({ mode: "edit", id: selected.id });
  };

  const cancelEditor = () => {
    setEditor(null);
    setPicked(null);
  };

  if (!shelters) return <Loader />;

  const editing = editor?.mode === "edit" ? shelters.find((s) => s.id === editor.id) : null;
  const editorCoords = picked || (editing ? { lat: editing.lat, lng: editing.lng } : null);
  const hasDemo = shelters.some((s) => s.demo);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Shelters <span className="text-gradient">&amp; Hospitals</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Live capacity, resources, and routes. Saved for offline use.</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={startAdd}><Plus size={16} /> Add facility</Button>
            {isCommander && !hasDemo && <Button variant="ghost" onClick={seedDemo}><Database size={16} /> Load demo data</Button>}
            {isCommander && hasDemo && <Button variant="ghost" onClick={clearDemo}><Trash2 size={16} /> Clear demo</Button>}
          </div>
        )}
      </div>

      {offline && (
        <div className="flex items-center gap-3 rounded-2xl border border-ark-coral/50 bg-ark-coral/10 px-5 py-3 text-sm text-ark-coral">
          <WifiOff size={17} />
          Offline. Showing saved data{staleAt ? ` from ${timeAgo(new Date(staleAt).toISOString())}` : ""}. Capacity may be out of date.
        </div>
      )}

      {/* Filters */}
      <GlassCard className="space-y-4 p-4">
        <div className="relative">
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or address"
            className="input-glass pl-11" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[["all", "All"], ...Object.entries(TYPE_META).map(([k, v]) => [k, v.plural])].map(([k, label]) => (
            <button key={k} onClick={() => setType(k)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                type === k
                  ? "border-ark-cyan bg-gradient-to-r from-ark-indigo/40 to-ark-cyan/30 text-white"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}>
              {label}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={onlyAvail} onChange={(e) => setOnlyAvail(e.target.checked)} className="accent-ark-cyan" />
            Available only
          </label>
        </div>
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Map + detail (first in DOM so mobile sees the map first) */}
        <div className="space-y-6 lg:order-2 lg:col-span-3">
          <GlassCard className="overflow-hidden p-2">
            <ShelterMap
              shelters={list}
              selectedId={selectedId}
              onSelect={(id) => !editor && setSelectedId(id)}
              userPos={userPos}
              routeCoords={route?.data?.coords}
              routeApprox={route?.data?.approx}
              picking={!!editor}
              picked={picked}
              onPick={setPicked}
              fitPoints={fitPoints}
              fitKey={fitKey}
            />
          </GlassCard>

          <div ref={detailRef}>
            {editor ? (
              <ShelterEditor
                key={editor.id || "new"}
                initial={editing}
                coords={editorCoords}
                onSave={saveFacility}
                onCancel={cancelEditor}
                onDelete={isCommander && editing ? removeFacility : null}
              />
            ) : selected ? (
              <ShelterDetail
                shelter={selected}
                route={route}
                mode={mode}
                setMode={setMode}
                onRoute={getRoute}
                onSaveOffline={saveOffline}
                saving={saving}
                canManage={canManage}
                onAdjust={adjust}
                onEdit={startEdit}
                onClose={() => setSelectedId(null)}
                hasPos={!!userPos}
              />
            ) : null}
          </div>
        </div>

        {/* List */}
        <div className="space-y-3 lg:order-1 lg:col-span-2 lg:max-h-[1000px] lg:overflow-y-auto lg:pr-1">
          {list.length === 0 ? (
            <GlassCard className="text-center text-sm text-slate-400">
              {shelters.length === 0
                ? canManage
                  ? "No facilities yet. Add one, or load demo data."
                  : "No facilities have been listed yet. Check back soon."
                : "No facilities match your filters."}
            </GlassCard>
          ) : (
            list.map((s) => (
              <ShelterCard key={s.id} shelter={s} selected={s.id === selectedId} onSelect={(id) => !editor && setSelectedId(id)} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}