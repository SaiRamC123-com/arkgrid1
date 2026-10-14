import { motion } from "framer-motion";
import { STATUS_META } from "./statusMeta";

const active = {
  safe: "border-ark-cyan bg-ark-cyan/15 text-ark-cyan shadow-glow-cyan",
  unknown: "border-ark-indigo bg-ark-indigo/20 text-indigo-200 shadow-glow-indigo",
  sos: "border-ark-coral bg-ark-coral/20 text-ark-coral shadow-glow-coral",
};

export default function StatusToggle({ value, onChange, busy }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Object.entries(STATUS_META).map(([key, { label, icon: Icon }]) => (
        <motion.button
          key={key}
          whileTap={{ scale: 0.94 }}
          disabled={busy}
          onClick={() => value !== key && onChange(key)}
          className={`flex flex-col items-center gap-2 rounded-2xl border py-4 text-sm font-semibold transition-all disabled:opacity-60 ${
            value === key ? active[key] : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
          }`}
        >
          <Icon size={26} />
          {label}
        </motion.button>
      ))}
    </div>
  );
}