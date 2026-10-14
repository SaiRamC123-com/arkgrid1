import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, CircleMarker, Tooltip, Polyline } from "react-leaflet";
import { Database, Trash2, Truck, AlertTriangle, PackageX } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { logisticsApi } from "../../services/logisticsService";
import { roadApi } from "../../services/roadService";
import { acquireSocket, releaseSocket } from "../../services/socket";
import useCachedList from "../../hooks/useCachedList";
import { fetchRouteAlternatives, straightRoute } from "../../utils/routing";
import { routeHazards, timeAgo } from "../../utils/geo";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../../components/ui/GlassCard";
import Button from "../../components/ui/Button";
import Loader from "../../components/ui/Loader";
import { DarkTiles, FitBounds } from "../../components/map/MapKit";
import StockCard from "../../components/logistics/StockCard";
import TripCard from "../../components/logistics/TripCard";
import RatesPanel from "../../components/logistics/RatesPanel";
import { RES, LEVEL, levelOf, fmtH } from "../../components/logistics/logMeta";
import { ROAD_STATUS } from "../../components/roads/roadMeta";
import AddStock from "../../components/logistics/AddStock";


export default function Logistics() {
  const { profile } = useAuth();
  const isCommander = profile.role === "commander";
  const { data: roads } = useCachedList("roads", roadApi.list, 30000);

  const [data, setData] = useState(null);
  const [surge, setSurge] = useState(0);
  const [targetH, setTargetH] = useState(48);
  const [selectedId, setSelectedId] = useState(null);
  const [routes, setRoutes] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await logisticsApi.get({ surgePct: surge, targetH })); }
    catch (err) { toast.error(errMsg(err), { id: "lg-load" }); }
  }, [surge, targetH]);

  useEffect(() => {
    const d = setTimeout(load, 250);
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    const s = acquireSocket();
    let x = null;
    const onInv = () => { clearTimeout(x); x = setTimeout(load, 500); };
    s.on("ops:invalidate", onInv);
    return () => { clearTimeout(d); clearInterval(t); clearTimeout(x); s.off("ops:invalidate", onInv); releaseSocket(); };
  }, [load]);

  const planRoute = async (trip) => {
    setRoutes((r) => ({ ...r, [trip.id]: { loading: true } }));
    try {
      let opts;
      try { opts = await fetchRouteAlternatives(trip.from, trip.to); }
      catch { opts = [straightRoute(trip.from, trip.to, "driving")]; toast("Routing unavailable. Showing a straight-line estimate", { icon: "📡" }); }
      const evals = opts.map((o) => ({ ...o, hazards: o.approx ? [] : routeHazards(o.coords, roads || []) }))
        .sort((a, b) => a.hazards.length - b.hazards.length || a.durationS - b.durationS);
      setRoutes((r) => ({ ...r, [trip.id]: { options: evals, pick: 0 } }));
      setSelectedId(trip.to.id);
    } catch (err) {
      setRoutes((r) => ({ ...r, [trip.id]: { error: errMsg(err) } }));
    }
  };

  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  const rows = useMemo(() => (data ? [...data.rows].sort((a, b) => (a.minRunwayH ?? 1e9) - (b.minRunwayH ?? 1e9)) : []), [data]);
  const shownRoutes = Object.entries(routes).map(([id, r]) => r.options?.[r.pick ?? 0]).filter(Boolean);
  const fitPoints = rows.map((r) => [r.lat, r.lng]);

  if (!data) return <Loader />;
  const th = data.thresholds;
  const crit = data.alerts.filter((a) => a.level === "critical").length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Relief <span className="text-gradient">Logistics</span></h1>
          <p className="mt-1 text-sm text-slate-400">Stock, burn rate and runway per facility, with a balancing plan and hazard-checked routes. Updated {timeAgo(data.generatedAt)}.</p>
        </div>
        {isCommander && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => act(() => logisticsApi.seedDemo(), "Demo stock loaded")} disabled={busy}><Database size={16} /> Load demo stock</Button>
            <Button variant="ghost" onClick={() => act(() => logisticsApi.clearDemo(), "Demo stock cleared")} disabled={busy}><Trash2 size={16} /></Button>
          </div>
        )}
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-ark-indigo/40 bg-ark-indigo/10 px-5 py-3 text-sm text-indigo-200">
        <Truck size={18} className="mt-0.5 shrink-0" />
        <span>Planning aid. Runway is stock divided by assumed consumption, and transfer suggestions ignore vehicle capacity and real road closures beyond reported ones. Verify before moving supplies.</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Object.entries(RES).map(([k, { label, unit }]) => {
          const s = data.system[k];
          const lv = LEVEL[levelOf(s.runwayH, th)];
          return <GlassCard key={k} className="p-4"><p className="text-xs uppercase tracking-wider text-slate-400">{label} (system-wide)</p><p className="mt-1 font-display text-3xl font-bold" style={{ color: lv.hex }}>{fmtH(s.runwayH)}</p><p className="text-[11px] text-slate-500">{Math.round(s.stock).toLocaleString()} {unit} · {Math.round(s.burnH * 24).toLocaleString()} {unit}/day</p></GlassCard>;
        })}
        <GlassCard className={`p-4 ${crit ? "border-ark-coral/60 shadow-glow-coral" : ""}`}><p className="text-xs uppercase tracking-wider text-slate-400">Shortage alerts</p><p className="mt-1 font-display text-3xl font-bold text-ark-coral">{data.alerts.length}</p><p className="text-[11px] text-slate-500">{crit} critical · {data.untracked.length} facilities untracked</p></GlassCard>
      </div>

      <GlassCard className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex justify-between text-xs uppercase tracking-wider text-slate-400"><span>What-if: more arrivals</span><span className="text-ark-coral">+{surge}% occupancy</span></div>
          <input type="range" min={0} max={100} step={10} value={surge} onChange={(e) => setSurge(Number(e.target.value))} className="w-full accent-ark-coral" />
          <p className="text-[11px] text-slate-500">Capped at each facility's capacity.</p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">Top up recipients to</p>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1">
            {[24, 48, 72, 96].map((h) => <button key={h} onClick={() => setTargetH(h)} className={`rounded-lg py-1.5 text-xs font-semibold ${targetH === h ? "bg-gradient-to-r from-ark-indigo to-ark-cyan text-white" : "text-slate-400"}`}>{h} h</button>)}
          </div>
        </div>
      </GlassCard>

      <RatesPanel key={JSON.stringify(data.rates) + JSON.stringify(data.defaults) + data.custom} data={data} canEdit={isCommander} onSaved={load} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <GlassCard className="overflow-hidden p-2">
            <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[360px] w-full sm:h-[460px]" scrollWheelZoom>
              <DarkTiles />
              <FitBounds points={fitPoints} fitKey={`${rows.length}`} />
              {(roads || []).filter((r) => r.status !== "passable" && !r.stale).map((r) => (
                <Polyline key={r.id} positions={r.coords.map((p) => [p.lat, p.lng])} interactive={false} pathOptions={{ color: ROAD_STATUS[r.status].hex, weight: 4, opacity: 0.6, dashArray: "6 8" }} />
              ))}
              {shownRoutes.map((o, i) => <Polyline key={i} positions={o.coords} pathOptions={{ color: o.hazards.length ? "#FF5A6E" : "#22D3EE", weight: 5, opacity: 0.95 }} />)}
              {rows.map((r) => {
                const lv = LEVEL[levelOf(r.minRunwayH, th)];
                return (
                  <CircleMarker key={r.id} center={[r.lat, r.lng]} radius={r.id === selectedId ? 11 : 8} eventHandlers={{ click: () => setSelectedId(r.id) }}
                    pathOptions={{ color: "#fff", weight: r.id === selectedId ? 3 : 1.5, fillColor: lv.hex, fillOpacity: 0.95 }}>
                    <Tooltip direction="top">{r.name} · {r.persons ? `~${fmtH(r.minRunwayH)} left` : "supply point"}</Tooltip>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </GlassCard>
          <p className="px-1 text-xs text-slate-500">Pin colour = worst runway at that facility. Dashed lines are flooded or blocked road reports. Planned routes turn coral if they cross one.</p>

          <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Truck size={18} className="text-ark-cyan" /> Balancing plan</h3>
          {data.plan.trips.length === 0 && <GlassCard className="text-sm text-slate-400">No transfers needed. Every facility with demand has more than {th.warnH} h of every supply, or nothing nearby has a surplus.</GlassCard>}
          {data.plan.trips.map((trip) => <TripCard key={trip.id} trip={trip} state={routes[trip.id]} onPlan={planRoute} onChoose={(id, i) => setRoutes((r) => ({ ...r, [id]: { ...r[id], pick: i } }))} />)}

          {data.plan.shortfall.length > 0 && (
            <GlassCard className="border-ark-coral/50">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ark-coral"><PackageX size={18} /> External resupply needed</h3>
              <p className="mt-1 text-xs text-slate-400">Not covered by nearby surplus (within {th.maxKm} km), to reach {th.targetH} h of runway:</p>
              <div className="mt-3 space-y-2">
                {data.plan.shortfall.map((s, i) => (
                  <div key={i} className="flex justify-between rounded-xl bg-white/5 px-3 py-2 text-sm"><span>{s.name}</span><span className="text-ark-coral">{s.qty.toLocaleString()} {RES[s.resource].unit} {RES[s.resource].label.toLowerCase()}</span></div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>

        <div className="space-y-3 lg:col-span-2 lg:max-h-[1200px] lg:overflow-y-auto lg:pr-1">
          {data.alerts.length > 0 && (
            <GlassCard className="space-y-2 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={15} className="text-ark-coral" /> Shortage alerts</p>
              {data.alerts.map((a) => <p key={a.facilityId} className={`rounded-lg px-3 py-2 text-xs ${a.level === "critical" ? "bg-ark-coral/15 text-white" : "bg-ark-indigo/15 text-indigo-100"}`}>{a.message}</p>)}
            </GlassCard>
          )}
{data.untracked.length > 0 && <AddStock untracked={data.untracked} onSaved={load} />}
          {rows.map((r) => <StockCard key={r.id} row={r} th={th} selected={r.id === selectedId} onSelect={setSelectedId} onSaved={load} />)}
          {rows.length === 0 && <GlassCard className="text-center text-sm text-slate-400">No facility has stock recorded yet. Open a facility here after adding stock, or load demo stock (commander) after loading demo facilities on the Shelters page.</GlassCard>}
          
        </div>
      </div>
    </div>
  );
}