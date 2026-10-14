import { MapPin, Clock, Users, CheckCircle2, XCircle, Radio } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { timeAgo } from "../../utils/geo";

export const NEED_LABELS = {
  trapped: "Trapped", medical: "Medical help", water: "Water",
  food: "Food", boat: "Boat rescue", shelter: "Shelter",
};

export default function ActiveSOSCard({ phase, sos, queued, fix, online, onResolve }) {
  const queuedPhase = phase === "queued";
  const src = queuedPhase ? queued.payload : sos;
  const loc = queuedPhase
    ? src.lat != null ? { lat: src.lat, lng: src.lng, accuracy: src.accuracy } : null
    : src.location;
  const sentAt = queuedPhase ? src.triggeredAt : src.triggeredAt;

  return (
    <GlassCard className="relative overflow-hidden border-ark-coral/60 shadow-glow-coral">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56">
        {[0, 1, 2].map((i) => (
          <span key={i} className="absolute inset-0 animate-pulse-ring rounded-full border border-ark-coral/60"
            style={{ animationDelay: `${i * 0.8}s` }} />
        ))}
      </div>

      <Badge tone="coral">
        <Radio size={13} className="animate-pulse" />
        {queuedPhase ? "Queued, waiting for connection" : "SOS active. Responders can see you"}
      </Badge>

      <h2 className="mt-4 font-display text-3xl font-bold">
        {queuedPhase ? "Your SOS is saved" : "Help is being coordinated"}
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        {queuedPhase
          ? online
            ? "Sending now. This should take a few seconds."
            : "It will send automatically the moment your phone gets any signal. Keep the app open if you can."
          : "Your circle has been alerted. Your location keeps updating while this is active."}
      </p>

      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3">
          <Clock size={16} className="text-ark-cyan" /> Triggered {timeAgo(sentAt)}
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3">
          <Users size={16} className="text-ark-cyan" /> {src.peopleCount} {src.peopleCount > 1 ? "people" : "person"}
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 sm:col-span-2">
          <MapPin size={16} className="text-ark-coral" />
          {loc
            ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (±${loc.accuracy || "?"} m)`
            : "Location unavailable. Enable GPS if you can"}
        </div>
      </div>

      {(src.needs || []).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {src.needs.map((n) => <Badge key={n} tone="indigo">{NEED_LABELS[n]}</Badge>)}
        </div>
      )}
      {src.message && <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm italic text-slate-300">"{src.message}"</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button onClick={() => onResolve("safe")}><CheckCircle2 size={18} /> I'm safe now</Button>
        <Button variant="ghost" onClick={() => onResolve("false_alarm")}><XCircle size={18} /> False alarm</Button>
      </div>
    </GlassCard>
  );
}