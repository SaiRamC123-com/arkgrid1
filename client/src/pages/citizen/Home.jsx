import { Link } from "react-router-dom";
import { Radio, Users, Building2, CloudRain, Camera, Route, ArrowRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import GlassCard from "../../components/ui/GlassCard";
import Badge from "../../components/ui/Badge";

const cards = [
  { to: "/citizen/sos", icon: Radio, title: "One-Tap SOS", desc: "Broadcast your location and medical info instantly, even offline.", tone: "coral", color: "text-ark-coral" },
  { to: "/citizen/family", icon: Users, title: "Family Network", desc: "Track Safe, Unknown, and SOS status of your circle.", tone: "cyan", color: "text-ark-cyan" },
  { to: "/citizen/shelters", icon: Building2, title: "Find Shelter", desc: "Nearest shelters, hospitals, and relief points.", tone: "indigo", color: "text-indigo-300" },
  { to: "/citizen/risk", icon: CloudRain, title: "Flood Risk", desc: "See how exposed your area is, from terrain and rainfall.", tone: "cyan", color: "text-ark-cyan" },
  { to: "/citizen/reports", icon: Camera, title: "Report a Hazard", desc: "Photo reports help responders and your neighbours.", tone: "indigo", color: "text-indigo-300" },
  { to: "/citizen/roads", icon: Route, title: "Road Status", desc: "Which roads are passable, flooded, or blocked right now.", tone: "coral", color: "text-ark-coral" },
];

export default function Home() {
  const { profile } = useAuth();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <GlassCard className="relative overflow-hidden p-8 sm:p-10">
        <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-ark-coral/20 blur-3xl" />
        <Badge tone="cyan">● Network active</Badge>
        <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
          Hello, <span className="text-gradient">{profile.name.split(" ")[0]}</span>
        </h1>
        <p className="mt-2 max-w-xl text-slate-400">
          Your safety dashboard is ready. Set up your family circle and keep SOS one tap away.
        </p>
      </GlassCard>

      <div className="grid gap-5 md:grid-cols-3">
        {cards.map(({ to, icon: Icon, title, desc, tone, color }) => (
          <Link key={to} to={to}>
            <GlassCard hover tone={tone} className="h-full">
              <Icon size={30} className={color} />
              <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-slate-400">{desc}</p>
              <ArrowRight size={18} className="mt-5 text-slate-500" />
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}