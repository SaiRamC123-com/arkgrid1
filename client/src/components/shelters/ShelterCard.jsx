import { motion } from "framer-motion";
import Badge from "../ui/Badge";
import CapacityBar from "./CapacityBar";
import { TYPE_META, AVAIL_META } from "./shelterMeta";
import { fmtDistance } from "../../utils/geo";

export default function ShelterCard({ shelter, selected, onSelect }) {
  const t = TYPE_META[shelter.type];
  const a = AVAIL_META[shelter.availability];
  const Icon = t.icon;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(shelter.id)}
      className={`glass w-full p-4 text-left transition-all hover:bg-white/[0.08] ${
        selected ? "border-ark-cyan/70 shadow-glow-cyan" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-navy-900"
          style={{ background: a.hex }}
        >
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{shelter.name}</p>
          <p className="text-xs text-slate-400">
            {t.label}
            {shelter.dist != null && ` · ${fmtDistance(shelter.dist)} away`}
          </p>
        </div>
        <Badge tone={a.tone}>{a.label}</Badge>
      </div>
      <div className="mt-3">
        <CapacityBar capacity={shelter.capacity} occupied={shelter.occupied} availability={shelter.availability} slim />
      </div>
    </motion.button>
  );
}