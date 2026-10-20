import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const SECONDS = 5;

export default function SOSButton({ onActivate, onStart, onCancel, status, disabled }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      setCount(null);
      onActivate();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const start = () => {
    if (disabled || count !== null || onStart?.() === false) return;
    navigator.vibrate?.(150);
    setCount(SECONDS);
  };

  return (
    <>
      <div className="relative mx-auto flex h-64 w-64 items-center justify-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ark-coral/40" />
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ark-coral/30 [animation-delay:1.2s]" />
        <span
          className="absolute inset-2 animate-spin-slow rounded-full blur-[3px]"
          style={{ background: "conic-gradient(from 0deg,#FF5A6E,#6366F1,#22D3EE,#FF5A6E)" }}
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.93 }}
          onClick={start}
          disabled={disabled}
          aria-label="Send SOS"
          className="relative flex h-52 w-52 flex-col items-center justify-center rounded-full border border-white/25
                     bg-gradient-to-br from-ark-coral via-[#e8456b] to-ark-indigo shadow-glow-coral
                     disabled:opacity-60"
        >
          <span className="font-display text-6xl font-bold tracking-wider text-white drop-shadow">SOS</span>
          <span className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Tap to start</span>
        </motion.button>
      </div>

      <AnimatePresence>
        {count !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 bg-navy-950/90 backdrop-blur-xl"
          >
            <p className="font-display text-xl font-semibold text-ark-coral">Activating SOS in</p>
            <div className="relative h-64 w-64">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <defs>
                  <linearGradient id="sosRing" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FF5A6E" />
                    <stop offset="1" stopColor="#6366F1" />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r="54" stroke="rgba(255,255,255,.1)" strokeWidth="6" fill="none" />
                <motion.circle
                  cx="60" cy="60" r="54" stroke="url(#sosRing)" strokeWidth="6" fill="none" strokeLinecap="round"
                  initial={{ pathLength: 1 }} animate={{ pathLength: 0 }}
                  transition={{ duration: SECONDS, ease: "linear" }}
                />
              </svg>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={count}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.6, opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center font-display text-8xl font-bold text-white"
                >
                  {count}
                </motion.span>
              </AnimatePresence>
            </div>
            <p role="status" aria-live="polite" className="max-w-xs text-center text-sm text-slate-300">
              {status || "Preparing your SOS…"}
            </p>
            <button
              onClick={() => {
                setCount(null);
                onCancel?.();
              }}
              className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-8 py-3 font-semibold hover:bg-white/20"
            >
              <X size={18} /> Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}