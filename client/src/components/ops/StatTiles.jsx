import { Siren, Layers, Users, Zap, Package, Camera } from "lucide-react";
import GlassCard from "../ui/GlassCard";

export default function StatTiles({ data }) {
  const crit = data.incidents.filter((i) => i.severity === "critical").length;
  const avail = data.teams.filter((t) => t.status === "available").length;
  const onScene = data.teams.filter((t) => t.status === "on_scene").length;
  const down = data.infra.filter((x) => x.status === "down").length;
  const degraded = data.infra.filter((x) => x.status === "degraded").length;
  const s = data.shelters.summary;
  const shortCount = Object.values(s.short).reduce((a, r) => a + r.out, 0);
  const people = data.sos.reduce((a, x) => a + x.peopleCount, 0);

  const tiles = [
    { label: "Active SOS", value: data.sos.length, sub: `${people} people`, icon: Siren, color: "text-ark-coral", glow: data.sos.length > 0 },
    { label: "Open incidents", value: data.incidents.length, sub: `${crit} critical`, icon: Layers, color: "text-indigo-300" },
    { label: "Teams ready", value: `${avail}/${data.teams.length}`, sub: `${onScene} on scene`, icon: Users, color: "text-ark-cyan" },
    { label: "Infrastructure", value: down + degraded, sub: `${down} down`, icon: Zap, color: down ? "text-ark-coral" : "text-ark-cyan" },
    { label: "Facilities full", value: s.full, sub: `${shortCount} supply outages`, icon: Package, color: "text-indigo-300" },
    { label: "Unverified reports", value: data.reports.unverified, sub: `${data.reports.verified} verified`, icon: Camera, color: "text-ark-cyan" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      {tiles.map(({ label, value, sub, icon: Icon, color, glow }) => (
        <GlassCard key={label} hover className={`p-4 ${glow ? "border-ark-coral/60 shadow-glow-coral" : ""}`}>
          <Icon size={20} className={color} />
          <p className="mt-3 font-display text-3xl font-bold">{value}</p>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-[11px] text-slate-500">{sub}</p>
        </GlassCard>
      ))}
    </div>
  );
}