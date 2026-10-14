import { motion } from "framer-motion";
import { Siren, Camera, Users, Clock, MapPinOff, Radio } from "lucide-react";
import Badge from "../ui/Badge";
import { SEV, OPS } from "./incidentMeta";
import { REPORT_TYPES } from "../reports/reportMeta";
import { fmtDistance, timeAgo } from "../../utils/geo";

export default function IncidentCard({ i, selected, onSelect }) {

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: i.ops === "dispatched" ? 0.7 : 1, y: 0 }}
      onClick={() => onSelect(i.id)}
      role="button"
      className={`glass cursor-pointer p-4 transition-all hover:bg-white/[0.08] ${
        selected ? "border-ark-cyan/70 shadow-glow-cyan" : i.severity === "critical" ? "border-ark-coral/50" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-lg font-bold text-navy-900"
          style={{ background: sev.hex, boxShadow: `0 0 16px ${sev.hex}` }}>
          {i.signals}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{i.title}</p>
          <p className="text-xs text-slate-400">INC-{i.code}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone={sev.tone}>{sev.label}</Badge>
          <Badge tone={ops.tone}>{ops.label}</Badge>
        </div>
      </div>

      {i.hasNewActivity && (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-ark-coral">
          <Radio size={13} className="animate-pulse" /> New activity since you last reviewed this
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400">
        {i.counts.sos > 0 && <span className="flex items-center gap-1.5 text-ark-coral"><Siren size={13} /> {i.counts.sos} SOS</span>}
        {i.counts.reports > 0 && <span className="flex items-center gap-1.5"><Camera size={13} /> {i.counts.reports} reports ({i.counts.verified} verified)</span>}
        {i.people > 0 && <span className="flex items-center gap-1.5"><Users size={13} /> {i.people} people</span>}
        <span className="flex items-center gap-1.5"><Clock size={13} /> {timeAgo(i.lastAt)}</span>
        {i.unlocated ? (
          <span className="flex items-center gap-1.5 text-ark-coral"><MapPinOff size={13} /> No location</span>
        ) : (
          i.radiusM > 0 && <span>Spread {fmtDistance(i.radiusM)}</span>
        )}
      </div>

      {i.types.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {i.types.map((t) => <Badge key={t} tone="indigo">{REPORT_TYPES[t]?.label || t}</Badge>)}
        </div>
      )}
    </motion.div>
  );
}