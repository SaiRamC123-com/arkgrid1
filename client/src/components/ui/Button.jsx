import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const variants = {
  primary: "btn-accent text-white",
  danger: "bg-gradient-to-r from-ark-coral to-ark-indigo text-white shadow-glow-coral",
  ghost: "bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10",
};

export default function Button({ children, variant = "primary", loading = false, className = "", ...props }) {
  return (
    <motion.button
whileHover={{ scale: 1.04, y: -1 }}
    whileTap={{ scale: 0.96 }}
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold
        transition-all disabled:opacity-60 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </motion.button>
  );
}