import { motion } from "framer-motion";
import { Crosshair, Users, Clock, AlertTriangle, Waves } from "lucide-react";
import Badge from "../ui/Badge";
import { CRITERIA, KEYS, bandOf } from "../../utils/mcda";
import { SEV } from "../incidents/incidentMeta";
import { timeAgo } from "../../utils/geo";

const FLOWS = [["", "Not assessed"], ["still", "Still"], ["slow", "Slow"], ["moderate", "Moderate"], ["fast", "Fast"]];

export default function PriorityCard({ it, weights, previewing, selected, onSelect, onFocus, onFlow, busy }) {
  const band = bandOf(it.score);
  const tot = KEYS.reduce((a, k) => a + weights[k], 0) || 1;
  const parts = CRITERIA.map((c) => ({ ...c, v: it.criteria[c.key], pts: (100 * weights[c.key] * it.criteria[c.key]) / tot }));
  const [lo, hi] = it.rankRange || [it.rank, it.rank];
  const spread = hi - lo;

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: it.assigned ? 0.75 : 1, y: 0 }}
      onClick={() => onSelect(it.id)} role="button"
      className={`glass cursor-pointer p-4 transition-all hover:bg-white/[0.08] ${selected ? "border-ark-cyan/70 shadow-glow-cyan" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl font-display text-navy-900" style={{ background: band.hex, boxShadow: `0 0 16px ${band.hex}` }}>
          <span className="text-xl font-bold leading-none">{it.rank}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{it.title}</p>
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
            <span>INC-{it.code}</span>
            <span className="flex items-center gap-1"><Users size={12} /> {it.people || "?"}</span>
            <span className="flex items-center gap-1"><Clock size={12} /> {it.hours} h waiting</span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-bold leading-none" style={{ color: band.hex }}>{Math.round(it.score)}</p>
          <p className="text-[11px] text-slate-400">{band.label}</p>
        </div>
        {it.centroid && (
          <button onClick={(e) => { e.stopPropagation(); onFocus(it.centroid); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-ark-cyan"><Crosshair size={16} /></button>
        )}
      </div>

      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/10" title="Contribution of each criterion to the score">
        {parts.map((p) => <div key={p.key} style={{ width: `${p.pts}%`, background: p.hex }} title={`${p.label}: ${p.pts.toFixed(1)} pts`} />)}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {!previewing && (
          <Badge tone={spread === 0 ? "cyan" : spread <= 2 ? "indigo" : "coral"}>
            {spread === 0 ? "Rank is firm" : `Rank ${lo}-${hi} under ±30% weights`}
          </Badge>
        )}
        <Badge tone={SEV[it.severity].tone}>{SEV[it.severity].label}</Badge>
        {it.assigned && it.teams.map((t) => <Badge key={t.name} tone="cyan">{t.name} · {t.status.replace("_", " ")}</Badge>)}
      </div>

      {it.flags.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-indigo-300">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {it.flags.join(" · ")}
        </p>
      )}

      <details className="mt-3" onClick={(e) => e.stopPropagation()}>
        <summary className="cursor-pointer text-xs font-semibold text-ark-cyan">Why this score</summary>
        <div className="mt-3 space-y-2">
          {parts.map((p) => (
            <div key={p.key} className="text-xs">
              <div className="flex justify-between"><span style={{ color: p.hex }} className="font-semibold">{p.label}</span><span className="text-slate-400">{Math.round(p.v * 100)}% → {p.pts.toFixed(1)} pts</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${p.v * 100}%`, background: p.hex }} /></div>
              <p className="mt-0.5 text-[11px] text-slate-500">{it.sources[p.key]}</p>
            </div>
          ))}
        </div>
      </details>

      <div className="mt-3 flex items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
        <Waves size={14} className="text-indigo-300" />
        <span className="text-slate-400">Water flow here:</span>
        <select disabled={busy} value={it.flow || ""} onChange={(e) => onFlow(it.id, e.target.value || null)} className="input-glass !w-auto !py-1 !text-xs [&>option]:bg-navy-800">
          {FLOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {it.lastAt && <p className="mt-2 text-[11px] text-slate-500">Last signal {timeAgo(it.lastAt)}</p>}
    </motion.div>
  );
}