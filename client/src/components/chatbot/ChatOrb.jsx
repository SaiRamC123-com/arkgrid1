import { motion } from "framer-motion";

export default function ChatOrb({ onClick }) {
  return (
    <div className="group fixed bottom-6 right-6 z-50">
      <span className="pointer-events-none absolute right-20 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl glass px-3 py-1.5 text-xs opacity-0 transition group-hover:opacity-100">
        Ask ArkBot ✨
      </span>

      <button onClick={onClick} aria-label="Open ArkBot" className="relative block h-16 w-16">
        {/* pulse rings */}
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ark-cyan/40" />
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ark-indigo/40 [animation-delay:1.2s]" />
        {/* rotating tri-color ring */}
        <span
          className="absolute -inset-1 animate-spin-slow rounded-full blur-[2px]"
          style={{ background: "conic-gradient(from 0deg,#6366F1,#22D3EE,#FF5A6E,#6366F1)" }}
        />
        {/* core */}
        <motion.span
          whileHover={{ scale: 1.12, rotate: 6 }}
          whileTap={{ scale: 0.92 }}
          className="relative flex h-full w-full items-center justify-center rounded-full border border-white/20 bg-navy-900 shadow-glow-cyan"
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <defs>
              <linearGradient id="botGrad" x1="0" y1="0" x2="32" y2="32">
                <stop stopColor="#22D3EE" />
                <stop offset="1" stopColor="#6366F1" />
              </linearGradient>
            </defs>
            <rect x="6" y="10" width="20" height="15" rx="5" stroke="url(#botGrad)" strokeWidth="2" />
            <path d="M16 10V6" stroke="url(#botGrad)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="16" cy="5" r="1.9" fill="#FF5A6E" />
            <circle cx="12" cy="17" r="2" fill="#22D3EE" />
            <circle cx="20" cy="17" r="2" fill="#22D3EE" />
            <path d="M12.5 21.5c2 1.2 5 1.2 7 0" stroke="url(#botGrad)" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M3 16v3M29 16v3" stroke="url(#botGrad)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </motion.span>
        {/* live dot */}
        <span className="absolute -right-0.5 -top-0.5 h-4 w-4 animate-pulse rounded-full border-2 border-navy-900 bg-ark-coral" />
      </button>
    </div>
  );
}