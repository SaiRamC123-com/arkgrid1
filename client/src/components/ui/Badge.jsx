const tones = {
  indigo: "bg-ark-indigo/15 text-indigo-300 border-ark-indigo/40",
  cyan: "bg-ark-cyan/15 text-ark-cyan border-ark-cyan/40",
  coral: "bg-ark-coral/15 text-ark-coral border-ark-coral/40",
};

export default function Badge({ children, tone = "indigo", className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}