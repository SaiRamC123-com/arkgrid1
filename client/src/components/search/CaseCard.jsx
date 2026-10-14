import { motion } from "framer-motion";
import { Clock, CheckCircle2, XCircle, Trash2, RefreshCw } from "lucide-react";
import Badge from "../ui/Badge";
import { SITUATIONS, COMPASS, SPEEDS, fmtElapsed } from "./searchMeta";

const sel = "input-glass !w-auto !py-1 !text-xs [&>option]:bg-navy-800";

export default function CaseCard({ c, selected, onSelect, isCommander, busy, onUpdate, onDelete, now }) {
  const S = SITUATIONS[c.situation];
  const Icon = S.icon;
  const active = c.status === "active";

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: active ? 1 : 0.6, y: 0 }}
      onClick={() => active && onSelect(c.id)} role="button"
      className={`glass p-4 transition-all ${active ? "cursor-pointer hover:bg-white/[0.08]" : ""} ${selected ? "border-ark-cyan/70 shadow-glow-cyan" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ark-indigo to-ark-cyan"><Icon size={19} /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{c.name}{c.demo && <span className="ml-2 text-xs text-slate-400">(demo)</span>}</p>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
            <span>{S.label}</span>
            <span className="flex items-center gap-1"><Clock size={12} /> missing {fmtElapsed(c.lastSeenAt, now)}</span>
          </p>
        </div>
        <Badge tone={c.status === "active" ? "coral" : c.status === "found" ? "cyan" : "indigo"}>
          {c.status === "active" ? "Searching" : c.status === "found" ? "Found" : "Closed"}
        </Badge>
      </div>
      {c.note && <p className="mt-2 text-sm text-slate-300">{c.note}</p>}
      {c.sosId && <p className="mt-1 text-xs text-slate-500">From a lost-contact SOS</p>}

      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <select disabled={busy} className={sel} value={c.situation} onChange={(e) => onUpdate(c.id, { situation: e.target.value })}>
            {Object.entries(SITUATIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select disabled={busy} className={sel} value={c.flow?.bearing ?? ""}
            onChange={(e) => onUpdate(c.id, { flow: e.target.value === "" && !c.flow?.speedClass ? null : { bearing: e.target.value === "" ? null : Number(e.target.value), speedClass: c.flow?.speedClass || null } })}>
            {COMPASS.map(([v, l]) => <option key={v} value={v}>{v === "" ? "Flow: terrain" : `Flow → ${l}`}</option>)}
          </select>
          <select disabled={busy} className={sel} value={c.flow?.speedClass || ""}
            onChange={(e) => onUpdate(c.id, { flow: e.target.value === "" && c.flow?.bearing == null ? null : { bearing: c.flow?.bearing ?? null, speedClass: e.target.value || null } })}>
            {SPEEDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {active ? (
          <>
            <button disabled={busy} onClick={() => onUpdate(c.id, { status: "found" })} className="flex items-center gap-1.5 rounded-lg border border-ark-cyan/50 bg-ark-cyan/15 px-3 py-1.5 text-xs font-semibold text-ark-cyan hover:bg-ark-cyan/25"><CheckCircle2 size={13} /> Mark found</button>
            <button disabled={busy} onClick={() => onUpdate(c.id, { status: "closed" })} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"><XCircle size={13} /> Close</button>
          </>
        ) : (
          <button disabled={busy} onClick={() => onUpdate(c.id, { status: "active" })} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"><RefreshCw size={13} /> Reopen</button>
        )}
        {isCommander && <button disabled={busy} onClick={() => window.confirm(`Delete "${c.name}"?`) && onDelete(c.id)} className="ml-auto rounded-lg p-1.5 text-slate-500 hover:text-ark-coral"><Trash2 size={15} /></button>}
      </div>
    </motion.div>
  );
}