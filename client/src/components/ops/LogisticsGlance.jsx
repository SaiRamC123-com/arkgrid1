import { Link } from "react-router-dom";
import { Package, ArrowRight } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import { RES_META } from "../shelters/shelterMeta";

export default function LogisticsGlance({ shelters }) {
  const { summary, items } = shelters;
  const trouble = items.filter((s) => Object.values(s.resources).some((v) => v === "out") || s.availability === "full").slice(0, 5);

  return (
    <GlassCard>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Package size={19} className="text-indigo-300" /> Facilities and supplies</h3>
        <Link to="/command/shelters" className="ml-auto flex items-center gap-1 text-xs font-semibold text-ark-cyan hover:underline">Open <ArrowRight size={13} /></Link>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[["Total", summary.total, ""], ["Open", summary.open, "text-ark-cyan"], ["Full", summary.full, "text-ark-coral"], ["Closed", summary.closed, "text-slate-400"]].map(([l, v, c]) => (
          <div key={l} className="rounded-xl bg-white/5 p-2"><p className={`font-display text-2xl font-bold ${c}`}>{v}</p><p className="text-[11px] text-slate-400">{l}</p></div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {Object.entries(RES_META).map(([k, { label, icon: Icon }]) => {
          const r = summary.short[k];
          return (
            <div key={k} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-slate-300"><Icon size={14} /> {label}</span>
              <span className="text-xs"><b className="text-ark-coral">{r.out}</b> out · <b className="text-indigo-300">{r.low}</b> low</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        {trouble.length === 0 && <p className="text-sm text-slate-500">No facility is full or out of supplies.</p>}
        {trouble.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
            <span className="truncate">{s.name}</span>
            <span className="flex shrink-0 gap-1.5">
              {s.availability === "full" && <Badge tone="coral">Full</Badge>}
              {Object.entries(s.resources).filter(([, v]) => v === "out").map(([k]) => <Badge key={k} tone="coral">{k} out</Badge>)}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}