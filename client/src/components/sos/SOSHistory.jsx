import { History } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import { timeAgo } from "../../utils/geo";

const META = {
  active: ["coral", "Active"],
  resolved: ["cyan", "Resolved"],
  cancelled: ["indigo", "False alarm"],
};

export default function SOSHistory({ items }) {
  return (
    <GlassCard>
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
        <History size={20} className="text-ark-indigo" /> My SOS history
      </h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 && <p className="text-sm text-slate-500">No SOS sent yet.</p>}
        {items.map((s) => {
          const [tone, label] = META[s.status] || META.active;
          return (
            <div key={s.id} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm">
              <div>
                <p className="text-slate-200">{timeAgo(s.triggeredAt)}</p>
                <p className="text-xs text-slate-500">
                  {s.delayedSec > 60 ? "Sent after reconnecting · " : ""}
                  {s.location ? `${s.location.lat.toFixed(3)}, ${s.location.lng.toFixed(3)}` : "No location"}
                </p>
              </div>
              <Badge tone={tone}>{label}</Badge>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}