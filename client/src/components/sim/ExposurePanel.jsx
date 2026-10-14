import { Building2, Zap, Siren, Route, Users } from "lucide-react";
import GlassCard from "../ui/GlassCard";

const fmt = (m) => (m < 1 ? "now" : m < 120 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);

function Group({ icon: Icon, title, items, tNow, label }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><Icon size={14} /> {title} ({items.length})</p>
      <div className="space-y-1.5">
        {items.slice(0, 8).map((x) => {
          const hit = x.tMin <= tNow;
          return (
            <div key={x.id} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-sm ${hit ? "bg-ark-coral/15 text-white" : "bg-white/5 text-slate-300"}`}>
              <span className="truncate">{x.name}{label?.(x)}</span>
              <span className={`shrink-0 text-xs ${hit ? "font-semibold text-ark-coral" : "text-slate-400"}`}>{fmt(x.tMin)}{x.depth != null && x.depth > 0 ? ` · ${x.depth} m` : ""}</span>
            </div>
          );
        })}
        {items.length > 8 && <p className="px-1 text-xs text-slate-500">+{items.length - 8} more</p>}
      </div>
    </div>
  );
}

export default function ExposurePanel({ sim, tNow }) {
  const e = sim.exposure;
  return (
    <GlassCard className="space-y-4">
      <h3 className="font-display text-lg font-semibold">Who and what is in the way</h3>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["People", e.totals.people, "text-ark-coral"], ["Facilities", e.totals.facilities, "text-indigo-300"], ["First hit", e.totals.earliestMin == null ? "none" : fmt(e.totals.earliestMin), "text-ark-cyan"]].map(([l, v, c]) => (
          <div key={l} className="rounded-xl bg-white/5 p-3"><p className={`font-display text-2xl font-bold ${c}`}>{v}</p><p className="text-[11px] text-slate-400">{l}</p></div>
        ))}
      </div>
      <p className="text-xs text-slate-500">{e.definition}. People = occupants of exposed facilities plus people in exposed active SOS. Red rows are exposed by the time on the slider.</p>
      <Group icon={Building2} title="Facilities" items={e.facilities} tNow={tNow} label={(x) => (x.occupied ? ` (${x.occupied} people)` : "")} />
      <Group icon={Siren} title="Active SOS" items={e.sos} tNow={tNow} label={(x) => ` (${x.people})`} />
      <Group icon={Zap} title="Infrastructure" items={e.infra} tNow={tNow} />
      <Group icon={Route} title="Roads" items={e.roads} tNow={tNow} />
      <Group icon={Users} title="Teams" items={e.teams} tNow={tNow} />
      {e.totals.facilities + e.totals.infra + e.totals.sos + e.totals.roads + e.totals.teams === 0 && <p className="text-sm text-slate-500">Nothing tracked is exposed in this scenario.</p>}
    </GlassCard>
  );
}