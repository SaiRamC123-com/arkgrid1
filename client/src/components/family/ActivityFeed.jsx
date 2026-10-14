import { Activity } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import { timeAgo } from "../../utils/geo";

const dot = (type) =>
  type === "status_sos" ? "bg-ark-coral" : type === "status_unknown" || type === "join" ? "bg-ark-indigo" : "bg-ark-cyan";

export default function ActivityFeed({ items }) {
  return (
    <GlassCard>
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Activity size={20} className="text-ark-indigo" /> Activity
      </h3>
      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
        {items.length === 0 && <p className="text-sm text-slate-500">Nothing yet.</p>}
        {items.map((a) => (
          <div key={a.id} className="flex gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot(a.type)}`} />
            <div>
              <p className="text-sm text-slate-200">{a.message}</p>
              <p className="text-xs text-slate-500">{timeAgo(a.at)}</p>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}