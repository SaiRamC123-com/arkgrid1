import { Siren, Phone, Crosshair, Users, Clock, HeartPulse } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import { NEED_LABELS } from "../sos/ActiveSOSCard";
import { timeAgo } from "../../utils/geo";

const Med = ({ m }) => {
  if (!m) return <p className="text-xs text-slate-500">No medical profile on file.</p>;
  const rows = [
    m.bloodGroup && ["Blood group", m.bloodGroup],
    m.mobility && m.mobility !== "none" && ["Mobility", m.mobility],
    m.vulnerabilities?.length && ["Vulnerable", m.vulnerabilities.join(", ")],
    m.conditions && ["Conditions", m.conditions],
    m.allergies && ["Allergies", m.allergies],
    m.medications && ["Medications", m.medications],
  ].filter(Boolean);
  return (
    <div className="space-y-1 text-xs">
      {rows.length === 0 && <p className="text-slate-500">Profile is empty.</p>}
      {rows.map(([k, v]) => <p key={k}><span className="text-slate-400">{k}: </span>{v}</p>)}
      {m.contacts?.map((c, i) => (
        <a key={i} href={`tel:${c.phone}`} className="block text-ark-cyan hover:underline">Contact: {c.name}{c.relation ? ` (${c.relation})` : ""} · {c.phone}</a>
      ))}
    </div>
  );
};

export default function SOSPanel({ sos, onFocus }) {
  return (
    <GlassCard className={sos.length ? "border-ark-coral/50" : ""}>
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Siren size={19} className="text-ark-coral" /> Active SOS
        <span className="ml-auto rounded-full bg-ark-coral/20 px-2.5 py-0.5 text-xs text-ark-coral">{sos.length}</span>
      </h3>
      <div className="mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">
        {sos.length === 0 && <p className="text-sm text-slate-500">No active SOS right now.</p>}
        {sos.map((s) => (
          <div key={s.id} className="rounded-2xl border border-ark-coral/40 bg-ark-coral/[0.07] p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.name}{s.demo && <span className="ml-2 text-xs text-slate-400">(demo)</span>}</p>
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Clock size={12} /> {timeAgo(s.triggeredAt)}</span>
                  <span className="flex items-center gap-1"><Users size={12} /> {s.peopleCount}</span>
                  {s.delayedSec > 60 && <span>sent after reconnecting</span>}
                </p>
              </div>
              {s.incidentCode && <Badge tone="indigo">INC-{s.incidentCode}</Badge>}
              {s.location && (
                <button onClick={() => onFocus(s.location)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-ark-cyan"><Crosshair size={17} /></button>
              )}
              {s.phone && <a href={`tel:${s.phone}`} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-ark-cyan"><Phone size={17} /></a>}
            </div>
            {s.needs.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{s.needs.map((n) => <Badge key={n} tone="coral">{NEED_LABELS[n] || n}</Badge>)}</div>}
            {s.message && <p className="mt-2 text-xs italic text-slate-300">"{s.message}"</p>}
            <details className="mt-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ark-cyan"><HeartPulse size={13} /> Medical info</summary>
              <div className="mt-2 rounded-xl bg-white/5 p-3"><Med m={s.medical} /></div>
            </details>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}