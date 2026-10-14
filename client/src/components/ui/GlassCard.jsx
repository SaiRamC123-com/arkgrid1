import { motion } from "framer-motion";

const glow = {
  indigo: "hover:shadow-glow-indigo",
  cyan: "hover:shadow-glow-cyan",
  coral: "hover:shadow-glow-coral",
};

export default function GlassCard({ children, className = "", hover = false, tone = "indigo", ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`glass p-6 ${hover ? `glass-hover ${glow[tone]}` : ""} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}