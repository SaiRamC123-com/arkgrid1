import { ThumbsUp, CheckCircle2, BadgeCheck, RefreshCw, Trash2, Clock, Ruler } from "lucide-react";
import { motion } from "framer-motion";
import Badge from "../ui/Badge";
import { ROAD_STATUS } from "./roadMeta";
import { fmtDistance, timeAgo } from "../../utils/geo";

const Btn = ({ children, onClick, disabled, tone }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    disabled={disabled}
    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
      tone === "primary" ? "border-ark-cyan/50 bg-ark-cyan/15 text-ark-cyan hover:bg-ark-cyan/25"
        : tone === "danger" ? "border-ark-coral/40 bg-ark-coral/10 text-ark-coral hover:bg-ark-coral/20"
        : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
    }`}
  >
    {children}
  </button>
);

export default function RoadCard({ r, selected, onSelect, isStaff, busy, onConfirm, onSetStatus, onRefresh, onDelete }) {
  const m = ROAD_STATUS[r.status];
  const Icon = m.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: r.stale ? 0.65 : 1, y: 0 }}
      onClick={() => onSelect(r.id)}
      role="button"
      className={`glass cursor-pointer p-4 transition-all hover:bg-white/[0.08] ${selected ? "border-ark-cyan/70 shadow-glow-cyan" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-navy-900" style={{ background: m.hex }}>
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{r.name}</p>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Clock size={12} /> {timeAgo(r.updatedAt)}</span>
            <span className="flex items-center gap-1"><Ruler size={12} /> {fmtDistance(r.lengthM)}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone={m.tone}>{m.label}{r.status === "flooded" && r.depthCm != null && ` · ${r.depthCm} cm`}</Badge>
          {r.verified ? <Badge tone="cyan"><BadgeCheck size={13} /> Verified</Badge> : <Badge tone="indigo">Unverified</Badge>}
        </div>
      </div>

      {r.note && <p className="mt-3 text-sm text-slate-300">{r.note}</p>}
      {r.stale && <p className="mt-2 text-xs text-ark-coral">Outdated (over 12 h). Confirm it or ask a responder to refresh it.</p>}
      {!r.verified && (
        <p className="mt-2 text-xs text-slate-400">{r.confirmCount}/{r.confirmationsNeeded} confirmations · reported by {r.authorName}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!r.mine && (r.confirmedByMe
          ? <span className="flex items-center gap-1.5 text-xs font-semibold text-ark-cyan"><CheckCircle2 size={14} /> You confirmed this</span>
          : <Btn tone="primary" disabled={busy} onClick={() => onConfirm(r.id)}><ThumbsUp size={13} /> Still accurate</Btn>)}
        {isStaff && Object.entries(ROAD_STATUS).filter(([k]) => k !== r.status).map(([k, v]) => (
          <Btn key={k} disabled={busy} onClick={() => onSetStatus(r.id, k)}>Set {v.label}</Btn>
        ))}
        {isStaff && <Btn disabled={busy} onClick={() => onRefresh(r.id)}><RefreshCw size={13} /> Refresh</Btn>}
        {(isStaff || (r.mine && !r.verified)) && <Btn tone="danger" disabled={busy} onClick={() => onDelete(r.id)}><Trash2 size={13} /> Remove</Btn>}
      </div>
    </motion.div>
  );
}