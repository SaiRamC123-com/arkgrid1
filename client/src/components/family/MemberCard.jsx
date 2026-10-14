import { motion } from "framer-motion";
import { Phone, MapPin, Clock } from "lucide-react";
import Badge from "../ui/Badge";
import { STATUS_META } from "./statusMeta";
import { distanceM, fmtDistance, timeAgo } from "../../utils/geo";

export default function MemberCard({ member, isMe, isOwner, myPos }) {
  const meta = STATUS_META[member.status] || STATUS_META.unknown;
  const Icon = meta.icon;
  const dist =
    myPos && member.lastLocation && !isMe ? fmtDistance(distanceM(myPos, member.lastLocation)) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass p-5 ${member.status === "sos" ? "border-ark-coral/70 shadow-glow-coral" : ""}`}
    >
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full font-display text-lg font-bold text-navy-900"
          style={{ background: meta.hex, boxShadow: `0 0 18px ${meta.hex}` }}
        >
          {member.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {member.name}
            {isMe && <span className="ml-1 text-xs text-slate-400">(You)</span>}
            {isOwner && <span className="ml-2 text-[10px] uppercase tracking-wider text-ark-cyan">Owner</span>}
          </p>
          <Badge tone={meta.tone} className="mt-1">
            <Icon size={13} /> {meta.label}
          </Badge>
        </div>
        {member.phone && !isMe && (
          <a href={`tel:${member.phone}`} className="rounded-xl bg-white/5 p-2.5 text-slate-300 hover:bg-ark-cyan/20 hover:text-ark-cyan">
            <Phone size={18} />
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <Clock size={13} /> Last seen {timeAgo(member.lastLocationAt)}
        </span>
        {member.lastLocation ? (
          <span className="flex items-center gap-1.5">
            <MapPin size={13} /> {dist ? `${dist} away` : "Location on map"}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <MapPin size={13} /> No location yet
          </span>
        )}
      </div>
    </motion.div>
  );
}