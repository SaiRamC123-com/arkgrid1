export default function Logo({ size = 40, text = true }) {
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <defs>
          <linearGradient id="arkLogo" x1="0" y1="0" x2="48" y2="48">
            <stop stopColor="#6366F1" />
            <stop offset=".55" stopColor="#22D3EE" />
            <stop offset="1" stopColor="#FF5A6E" />
          </linearGradient>
        </defs>
        <path
          d="M24 3 6 10v13c0 11 7.5 19.5 18 22 10.5-2.5 18-11 18-22V10L24 3Z"
          stroke="url(#arkLogo)" strokeWidth="2.5" fill="rgba(99,102,241,.14)"
        />
        <path
          d="M13 30c3-1 5-3 5-6s2-5 6-5 6 2 6 5 2 5 5 6"
          stroke="url(#arkLogo)" strokeWidth="2.5" strokeLinecap="round"
        />
        <circle cx="24" cy="14" r="2.6" fill="#FF5A6E" />
      </svg>
      {text && (
        <span className="font-display text-2xl font-bold tracking-tight">
          Ark<span className="text-gradient">Grid</span>
        </span>
      )}
    </div>
  );
}