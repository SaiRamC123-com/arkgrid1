import {
  Phone, MapPin, Navigation, Footprints, Car, DownloadCloud, X, Pencil,
  Minus, Plus, Clock, ExternalLink, AlertTriangle, HardDriveDownload,
} from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import CapacityBar from "./CapacityBar";
import { TYPE_META, AVAIL_META, RES_META, LEVEL_META } from "./shelterMeta";
import { fmtDistance, timeAgo } from "../../utils/geo";
import { fmtDuration } from "../../utils/routing";

export default function ShelterDetail({
  shelter, route, mode, setMode, onRoute, onSaveOffline, saving,
  canManage, onAdjust, onEdit, onClose, hasPos,
}) {
  const t = TYPE_META[shelter.type];
  const a = AVAIL_META[shelter.availability];
  const Icon = t.icon;
  const r = route?.data;

  return (
    <GlassCard className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-navy-900" style={{ background: a.hex }}>
          <Icon size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl font-bold leading-tight">{shelter.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={a.tone}>{a.label}</Badge>
            <span className="text-xs text-slate-400">{t.label}{shelter.demo && " · demo"}</span>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10"><X size={18} /></button>
      </div>

      <div className="space-y-2 text-sm text-slate-300">
        {shelter.address && <p className="flex items-center gap-2"><MapPin size={15} className="text-ark-cyan" /> {shelter.address}</p>}
        {shelter.phone && (
          <a href={`tel:${shelter.phone}`} className="flex items-center gap-2 hover:text-ark-cyan">
            <Phone size={15} className="text-ark-cyan" /> {shelter.phone}
          </a>
        )}
        {shelter.dist != null && <p className="flex items-center gap-2"><Navigation size={15} className="text-ark-cyan" /> {fmtDistance(shelter.dist)} away (straight line)</p>}
      </div>

      <CapacityBar capacity={shelter.capacity} occupied={shelter.occupied} availability={shelter.availability} />

      {canManage && shelter.capacity > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-3">
          <span className="mr-auto text-xs uppercase tracking-wider text-slate-400">Update occupancy</span>
          {[-10, -1, 1, 10].map((d) => (
            <button key={d} onClick={() => onAdjust(d)}
              className="flex min-w-[46px] items-center justify-center gap-0.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-semibold hover:bg-ark-cyan/20 hover:text-ark-cyan">
              {d < 0 ? <Minus size={13} /> : <Plus size={13} />}{Math.abs(d)}
            </button>
          ))}
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Resources</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(RES_META).map(([k, { label, icon: RIcon }]) => {
            const lvl = LEVEL_META[shelter.resources?.[k] || "ok"];
            return (
              <div key={k} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${lvl.cls}`}>
                <span className="flex items-center gap-2"><RIcon size={15} /> {label}</span>
                <span className="text-xs font-bold">{lvl.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Routing */}
      <div className="space-y-3 border-t border-white/10 pt-5">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
          {[["walking", "Walk", Footprints], ["driving", "Drive", Car]].map(([id, label, MIcon]) => (
            <button key={id} onClick={() => setMode(id)}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
                mode === id ? "bg-gradient-to-r from-ark-indigo to-ark-cyan text-white" : "text-slate-400"
              }`}>
              <MIcon size={16} /> {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button onClick={onRoute} loading={route?.loading} disabled={!hasPos}><Navigation size={16} /> Get route</Button>
          <Button variant="ghost" onClick={onSaveOffline} disabled={!hasPos || !!saving}>
            {saving ? <HardDriveDownload size={16} className="animate-pulse" /> : <DownloadCloud size={16} />}
            {saving ? `${Math.round((saving.done / saving.total) * 100)}%` : "Save offline"}
          </Button>
        </div>
        {!hasPos && <p className="text-xs text-slate-500">Waiting for your location to calculate a route.</p>}

        {r && (
          <div className="rounded-xl border border-ark-cyan/30 bg-ark-cyan/10 p-4">
            <p className="font-display text-2xl font-bold text-ark-cyan">{fmtDistance(r.distanceM)}</p>
            <p className="flex items-center gap-1.5 text-sm text-slate-300">
              <Clock size={14} /> about {fmtDuration(r.durationS)} {r.mode === "walking" ? "on foot" : "by road"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {route.saved && <Badge tone="indigo">Saved route · {timeAgo(new Date(r.savedAt).toISOString())}</Badge>}
              {r.approx && <Badge tone="coral">Straight-line estimate</Badge>}
            </div>
          </div>
        )}
        {r && hazards && hazards.length > 0 && (
  <div className="rounded-xl border border-ark-coral/50 bg-ark-coral/10 p-3 text-xs text-ark-coral shadow-glow-coral">
    <p className="flex items-center gap-1.5 font-semibold">
      <AlertTriangle size={14} /> Route passes near {hazards.length} flooded or blocked road report{hazards.length > 1 ? "s" : ""}
    </p>
    <p className="mt-1 text-slate-300">{hazards.map((h) => `${h.name} (${h.status})`).join(", ")}</p>
  </div>
)}
{r && hazards && hazards.length === 0 && (
  <p className="text-xs text-slate-400">No flooded or blocked roads are reported on this route. Reports may be incomplete.</p>
)}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-ark-coral" />
          Routes follow normal roads and do not know about flooding yet. Check the Road Accessibility layer before you travel.
        </p>

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${shelter.lat},${shelter.lng}&travelmode=${mode}`}
          target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 text-xs font-semibold text-ark-cyan hover:underline"
        >
          <ExternalLink size={13} /> Open in your Maps app
        </a>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-500">
        <span>Updated {timeAgo(shelter.updatedAt)}{shelter.updatedByName && ` by ${shelter.updatedByName}`}</span>
        {canManage && (
          <button onClick={onEdit} className="flex items-center gap-1.5 font-semibold text-ark-cyan hover:underline">
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>
    </GlassCard>
  );
}