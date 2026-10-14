import { Sparkles, ThumbsUp, CheckCircle2, BadgeCheck, XCircle, Clock, Loader2, ImageOff } from "lucide-react";
import { motion } from "framer-motion";
import Badge from "../ui/Badge";
import { REPORT_TYPES, SEVERITY_META, STATUS_META, pinHex } from "./reportMeta";
import { fmtDistance, timeAgo } from "../../utils/geo";

const Btn = ({ children, onClick, disabled, tone = "ghost" }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    disabled={disabled}
    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
      tone === "primary"
        ? "border-ark-cyan/50 bg-ark-cyan/15 text-ark-cyan hover:bg-ark-cyan/25"
        : tone === "danger"
          ? "border-ark-coral/40 bg-ark-coral/10 text-ark-coral hover:bg-ark-coral/20"
          : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
    }`}
  >
    {children}
  </button>
);

export default function ReportCard({ r, selected, onSelect, isStaff, busy, onConfirm, onStatus }) {
  const t = REPORT_TYPES[r.type];
  const Icon = t.icon;
  const st = STATUS_META[r.status] || STATUS_META.unverified;
  const open = ["unverified", "verified"].includes(r.status);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: r.status === "resolved" ? 0.6 : 1, y: 0 }}
      onClick={() => onSelect(r.id)}
      role="button"
      className={`glass cursor-pointer p-4 transition-all hover:bg-white/[0.08] ${selected ? "border-ark-cyan/70 shadow-glow-cyan" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-navy-900" style={{ background: pinHex(r) }}>
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.label}</p>
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock size={12} /> {timeAgo(r.createdAt)} · {r.authorName}
            {r.dist != null && ` · ${fmtDistance(r.dist)}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone={st.tone}>{r.status === "verified" && <BadgeCheck size={13} />} {st.label}</Badge>
          {isStaff && r.incidentCode && <Badge tone="indigo">INC-{r.incidentCode}</Badge>}
          {r.ai?.severity && <Badge tone={SEVERITY_META[r.ai.severity].tone}>{SEVERITY_META[r.ai.severity].label}</Badge>}
        </div>
      </div>

      {r.photoUrl && (
        <a href={r.photoUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-3 block">
          <img src={r.photoUrl} alt="Report" loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            className="max-h-44 w-full rounded-xl border border-white/10 object-cover" />
        </a>
      )}
      {r.description && <p className="mt-3 text-sm text-slate-200">{r.description}</p>}

      <div className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">
        {r.aiStatus === "pending" ? (
          <span className="flex items-center gap-2 text-slate-400"><Loader2 size={13} className="animate-spin" /> AI is analyzing this report…</span>
        ) : r.ai ? (
          <>
            <p className="flex items-start gap-2"><Sparkles size={13} className="mt-0.5 shrink-0 text-ark-cyan" /> {r.ai.summary || "No summary"}</p>
            {r.ai.type !== r.type && <p className="mt-1 text-indigo-300">AI suggests: {REPORT_TYPES[r.ai.type].label}</p>}
            {r.ai.photoMatches === false && isStaff && <p className="mt-1 text-ark-coral">Photo may not show a flood hazard</p>}
          </>
        ) : (
          <span className="text-slate-500">AI assist unavailable for this report</span>
        )}
      </div>

      {r.status === "unverified" && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <div className="flex gap-1">
            {Array.from({ length: r.confirmationsNeeded }).map((_, i) => (
              <span key={i} className={`h-2 w-6 rounded-full ${i < r.confirmCount ? "bg-ark-cyan" : "bg-white/10"}`} />
            ))}
          </div>
          {r.confirmCount}/{r.confirmationsNeeded} confirmations
        </div>
      )}
      {r.status === "verified" && r.verifiedBy && (
        <p className="mt-3 text-xs text-ark-cyan">
          Verified by {r.verifiedBy === "community" ? "community confirmations" : r.verifiedBy}
        </p>
      )}

      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!r.mine && (
            r.confirmedByMe ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ark-cyan"><CheckCircle2 size={14} /> You confirmed this</span>
            ) : (
              <Btn tone="primary" disabled={busy} onClick={() => onConfirm(r.id)}><ThumbsUp size={13} /> I can confirm this</Btn>
            )
          )}
          {isStaff && r.status === "unverified" && <Btn tone="primary" disabled={busy} onClick={() => onStatus(r.id, "verified")}><BadgeCheck size={13} /> Verify</Btn>}
          {(isStaff || r.mine) && <Btn disabled={busy} onClick={() => onStatus(r.id, "resolved")}><CheckCircle2 size={13} /> Mark resolved</Btn>}
          {isStaff && <Btn tone="danger" disabled={busy} onClick={() => onStatus(r.id, "rejected")}><XCircle size={13} /> Reject</Btn>}
        </div>
      )}
    </motion.div>
  );
}