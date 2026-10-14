import { motion } from "framer-motion";

const blobs = [
  { c: "bg-ark-indigo/30", s: "h-[34rem] w-[34rem] -top-40 -left-40", x: [0, 80, 0], y: [0, 60, 0] },
  { c: "bg-ark-cyan/20", s: "h-[30rem] w-[30rem] top-1/3 -right-40", x: [0, -70, 0], y: [0, 80, 0] },
  { c: "bg-ark-coral/20", s: "h-[28rem] w-[28rem] -bottom-40 left-1/4", x: [0, 60, 0], y: [0, -70, 0] },
];

export default function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-navy-900">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-[120px] ${b.c} ${b.s}`}
          animate={{ x: b.x, y: b.y }}
          transition={{ duration: 18 + i * 4, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}