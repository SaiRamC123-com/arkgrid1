export default function BotAvatar({ size = 36 }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <span className="absolute -inset-0.5 animate-spin-slow rounded-full blur-[1px]"
        style={{ background: "conic-gradient(#6366F1,#22D3EE,#FF5A6E,#6366F1)" }} />
      <span className="relative flex h-full w-full items-center justify-center rounded-full border border-white/20 bg-navy-900">
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 32 32" fill="none">
          <defs>
            <linearGradient id="botAv" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#22D3EE" /><stop offset="1" stopColor="#6366F1" /></linearGradient>
          </defs>
          <rect x="6" y="10" width="20" height="15" rx="5" stroke="url(#botAv)" strokeWidth="2" />
          <path d="M16 10V6" stroke="url(#botAv)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="5" r="1.9" fill="#FF5A6E" />
          <circle cx="12" cy="17" r="2" fill="#22D3EE" />
          <circle cx="20" cy="17" r="2" fill="#22D3EE" />
          <path d="M12.5 21.5c2 1.2 5 1.2 7 0" stroke="url(#botAv)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    </div>
  );
}