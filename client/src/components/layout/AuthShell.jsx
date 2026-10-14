import { motion } from "framer-motion";
import { Radio, Users, Brain } from "lucide-react";
import AuroraBackground from "../ui/AuroraBackground";
import Logo from "../ui/Logo";

const points = [
  { icon: Radio, text: "One-tap offline SOS that syncs when you reconnect", tone: "text-ark-coral" },
  { icon: Users, text: "Family safety circles with live Safe / Unknown / SOS status", tone: "text-ark-cyan" },
  { icon: Brain, text: "AI-assisted flood risk and rescue prioritization", tone: "text-indigo-300" },
];

export default function AuthShell({ children }) {
  return (
    <div className="relative flex min-h-screen">
      <AuroraBackground />

      <div className="hidden flex-1 flex-col justify-between p-12 lg:flex">
        <Logo size={46} />
        <div className="max-w-xl">
          <h1 className="font-display text-5xl font-bold leading-tight">
            Ready before the <span className="text-gradient">water rises.</span>
          </h1>
          <p className="mt-5 text-lg text-slate-400">
            Citizen safety, rescue intelligence, and command operations in one connected platform.
          </p>
          <div className="mt-10 space-y-4">
            {points.map(({ icon: Icon, text, tone }, i) => (
              <motion.div
                key={text}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.15 }}
                className="glass flex items-center gap-4 p-4"
              >
                <Icon className={tone} size={22} />
                <span className="text-sm text-slate-300">{text}</span>
              </motion.div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">Prototype architecture. No unfounded accuracy claims.</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-5">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size={44} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}