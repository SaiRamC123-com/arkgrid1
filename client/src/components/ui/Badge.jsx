const tones = {
  indigo: "bg-blue-50 text-blue-800 border-blue-200",
  cyan: "bg-cyan-50 text-cyan-800 border-cyan-200",
  coral: "bg-red-50 text-red-800 border-red-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function Badge({ children, tone = "indigo", className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}