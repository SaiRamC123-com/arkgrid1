import { AlertTriangle, ShieldAlert, Crosshair } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import { timeAgo } from "../../utils/geo";

export default function AlertFeed({ alerts, onFocus }) {
  return (
    <GlassCard>
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
        <ShieldAlert size={19} className="text-ark-coral" /> Situation alerts
        {alerts.length > 0 && <span className="ml-auto rounded-full bg-ark-coral/20 px-2.5 py-0.5 text-xs text-ark-coral">{alerts.length}</span>}
      </h3>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
        {alerts.length === 0 && <p className="text-sm text-slate-500">All clear. Alerts appear here automatically.</p>}
        {alerts.map((a) => (
          <div key={a.id}
            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${a.level === "critical" ? "border-ark-coral/50 bg-ark-coral/10" : "border-ark-indigo/40 bg-ark-indigo/10"}`}>
            <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${a.level === "critical" ? "text-ark-coral" : "text-indigo-300"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-slate-200">{a.message}</p>
              {a.at && <p className="text-xs text-slate-500">{timeAgo(a.at)}</p>}
            </div>
            {a.focus && (
              <button onClick={() => onFocus(a.focus)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-ark-cyan" title="Show on map">
                <Crosshair size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}