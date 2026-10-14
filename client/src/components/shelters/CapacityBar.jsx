import { motion } from "framer-motion";
import { AVAIL_META } from "./shelterMeta";

export default function CapacityBar({ capacity, occupied, availability, slim = false }) {
  if (!capacity) {
    return <p className="text-xs text-slate-500">Capacity not tracked</p>;
  }
  const pct = Math.min(100, Math.round((occupied / capacity) * 100));
  return (
    <div>
      <div className={`overflow-hidden rounded-full bg-white/10 ${slim ? "h-1.5" : "h-2.5"}`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={`h-full rounded-full bg-gradient-to-r ${AVAIL_META[availability].bar}`}
        />
      </div>
      {!slim && (
        <p className="mt-1.5 text-xs text-slate-400">
          {occupied} / {capacity} occupied · {Math.max(0, capacity - occupied)} free ({pct}%)
        </p>
      )}
    </div>
  );
}