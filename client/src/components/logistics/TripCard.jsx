import { ArrowRight, Route, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { RES, fmtH } from "./logMeta";
import { fmtDistance } from "../../utils/geo";
import { fmtDuration } from "../../utils/routing";

export default function TripCard({ trip, state, onPlan, onChoose }) {
  const opts = state?.options || [];
  const sel = opts[state?.pick ?? 0];
  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <span className="truncate">{trip.from.name}</span><ArrowRight size={15} className="shrink-0 text-ark-cyan" /><span className="truncate">{trip.to.name}</span>
        <Badge tone="indigo">{trip.km} km straight-line</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {trip.items.map((i) => { const R = RES[i.resource]; return <Badge key={i.resource} tone="cyan"><R.icon size={12} /> {i.qty.toLocaleString()} {i.unit} {R.label.toLowerCase()}</Badge>; })}
        <Badge tone={trip.urgencyH < 8 ? "coral" : "indigo"}>Recipient has ~{fmtH(trip.urgencyH)}</Badge>
      </div>
      <Button variant="ghost" onClick={() => onPlan(trip)} disabled={state?.loading}>
        {state?.loading ? <Loader2 size={15} className="animate-spin" /> : <Route size={15} />} Plan safe route
      </Button>

      {state?.error && <p className="text-xs text-ark-coral">{state.error}</p>}
      {sel && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          <div className="flex flex-wrap gap-2">
            {opts.map((o, i) => (
              <button key={i} onClick={() => onChoose(trip.id, i)} className={`rounded-lg border px-2.5 py-1 font-semibold ${i === (state.pick ?? 0) ? "border-ark-cyan bg-ark-cyan/15 text-ark-cyan" : "border-white/10 text-slate-400"}`}>
                Route {i + 1} · {fmtDuration(o.durationS)} · {o.hazards.length ? `${o.hazards.length} hazard${o.hazards.length > 1 ? "s" : ""}` : "clear"}
              </button>
            ))}
          </div>
          <p className="text-slate-300">{fmtDistance(sel.distanceM)} · about {fmtDuration(sel.durationS)} by road{sel.approx ? " (straight-line estimate)" : ""}</p>
          {sel.hazards.length === 0 ? (
            <p className="flex items-center gap-1.5 text-ark-cyan"><ShieldCheck size={14} /> No flooded or blocked road reports on this route. Reports can be incomplete.</p>
          ) : (
            <p className="flex items-start gap-1.5 text-ark-coral"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Passes {sel.hazards.map((h) => `${h.name} (${h.status})`).join(", ")}</p>
          )}
          {opts.every((o) => o.hazards.length > 0) && <p className="text-indigo-300">Every candidate route crosses a reported hazard. Check conditions on the ground or use a boat or air asset.</p>}
        </div>
      )}
    </GlassCard>
  );
}