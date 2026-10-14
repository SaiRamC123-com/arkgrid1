import { Sparkles } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";

export default function ComingSoon({ title }) {
  return (
    <div className="mx-auto flex max-w-xl justify-center pt-16">
      <GlassCard className="text-center">
        <Sparkles className="mx-auto text-ark-cyan" size={36} />
        <h2 className="mt-4 font-display text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">This module is built in an upcoming step.</p>
      </GlassCard>
    </div>
  );
}