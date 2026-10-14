import { useState } from "react";
import { X, Siren, CheckCheck, Truck, RotateCcw, ExternalLink, Loader2, Save } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { SEV, OPS } from "./incidentMeta";
import { REPORT_TYPES, STATUS_META } from "../reports/reportMeta";
import { NEED_LABELS } from "../sos/ActiveSOSCard";
import { timeAgo } from "../../utils/geo";

export default function IncidentDetail({ incident: i, members, busy, onOps, onClose }) {
  const [note, setNote] = useState(i.note || "");
  const sev = SEV[i.severity];

  return (
    <GlassCard className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-slate-400">Incident INC-{i.code}</p>
          <h3 className="font-display text-xl font-bold leading-tight">{i.title}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={sev.tone}>{sev.label}</Badge>
            <Badge tone={OPS[i.ops].tone}>{OPS[i.ops].label}</Badge>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10"><X size={18} /></button>
      </div>

      {i.needs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {i.needs.map((n) => <Badge key={n} tone="coral">{NEED_LABELS[n] || n}</Badge>)}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <Button disabled={busy || i.ops === "acknowledged"} variant={i.ops === "new" ? "primary" : "ghost"} onClick={() => onOps({ ops: "acknowledged" })}>
          <CheckCheck size={16} /> Acknowledge
        </Button>
        <Button disabled={busy || i.ops === "dispatched"} onClick={() => onOps({ ops: "dispatched" })}>
          <Truck size={16} /> Dispatched
        </Button>
        <Button variant="ghost" disabled={busy || i.ops === "new"} onClick={() => onOps({ ops: "new" })}>
          <RotateCcw size={16} /> Reset
        </Button>
      </div>
      {i.opsBy && <p className="-mt-2 text-xs text-slate-500">Last action by {i.opsBy} · {timeAgo(i.opsAt)}</p>}

      <div className="space-y-2">
        <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Team note (visible to responders and commanders)" className="input-glass resize-none" />
        <Button variant="ghost" disabled={busy || note === (i.note || "")} onClick={() => onOps({ note })} className="w-full">
          <Save size={15} /> Save note
        </Button>
      </div>

      {i.centroid && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${i.centroid.lat},${i.centroid.lng}`} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 text-xs font-semibold text-ark-cyan hover:underline">
          <ExternalLink size={13} /> Open center point in Maps
        </a>
      )}

      <div className="border-t border-white/10 pt-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">Signals in this incident ({i.signals})</p>
        {!members ? (
          <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Loading…</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {members.map((m) =>
              m.kind === "sos" ? (
                <div key={m.id} className="rounded-xl border border-ark-coral/40 bg-ark-coral/10 p-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-ark-coral">
                    <Siren size={15} /> SOS · {m.name}{m.demo && <span className="text-xs text-slate-400">(demo)</span>}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    {m.people} {m.people > 1 ? "people" : "person"}{m.needs.length > 0 && ` · ${m.needs.map((n) => NEED_LABELS[n] || n).join(", ")}`} · {timeAgo(m.at)}
                  </p>
                  {m.message && <p className="mt-1 text-xs italic text-slate-400">"{m.message}"</p>}
                </div>
              ) : (
                <div key={m.id} className="flex gap-3 rounded-xl bg-white/5 p-3 text-sm">
                  {m.photoUrl && <img src={m.photoUrl} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
                  <div className="min-w-0">
                    <p className="font-semibold">{REPORT_TYPES[m.type]?.label || m.type}</p>
                    <p className="text-xs text-slate-400">{m.summary || m.description || "No details"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge tone={(STATUS_META[m.status] || STATUS_META.unverified).tone}>{(STATUS_META[m.status] || STATUS_META.unverified).label}</Badge>
                      {timeAgo(m.at)}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}