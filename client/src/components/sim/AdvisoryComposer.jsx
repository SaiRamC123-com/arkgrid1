import { useCallback, useEffect, useState } from "react";
import { Megaphone, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { advisoryApi } from "../../services/simService";
import { draftAdvisory } from "../../utils/advisoryDraft";
import { errMsg } from "../../utils/errMsg";
import { timeAgo } from "../../utils/geo";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Badge from "../ui/Badge";

export default function AdvisoryComposer({ sim }) {
  const [sev, setSev] = useState("warning");
  const [f, setF] = useState(() => ({ ...draftAdvisory(sim, "warning"), hours: 6, radiusKm: Math.round((sim.radius_m / 1000) * 1.5 * 2) / 2, scope: "area" }));
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState([]);

  const load = useCallback(() => advisoryApi.manage().then(setActive).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const pickSev = (s) => { setSev(s); setF((x) => ({ ...x, ...draftAdvisory(sim, s) })); };

  const send = async () => {
    if (!ok) return toast.error("Tick the confirmation first");
    if (!window.confirm(`Issue this ${sev.toUpperCase()} advisory to ${f.scope === "all" ? "EVERYONE" : "people in the area"}? It appears in the app immediately.`)) return;
    setBusy(true);
    try {
      await advisoryApi.create({ severity: sev, title: f.title, message: f.message, hours: Number(f.hours), scope: f.scope, lat: sim.center.lat, lng: sim.center.lng, radiusM: f.radiusKm * 1000, confirm: true });
      toast.success("Advisory issued");
      setOk(false);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard className="space-y-4">
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Megaphone size={19} className="text-ark-coral" /> Evacuation advisory</h3>
      <p className="rounded-xl border border-ark-indigo/40 bg-ark-indigo/10 px-4 py-3 text-xs text-indigo-200">
        Drafted from this scenario for you to review and edit. It reaches people who have ArkGrid open (or cached) in the area. It does NOT replace official channels such as SMS alerts, sirens, or broadcast.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {["watch", "warning", "evacuate"].map((s) => (
          <button key={s} onClick={() => pickSev(s)} className={`rounded-xl border py-2 text-xs font-bold uppercase ${sev === s ? (s === "evacuate" ? "border-ark-coral bg-ark-coral/20 text-ark-coral" : "border-ark-cyan bg-ark-cyan/15 text-ark-cyan") : "border-white/10 text-slate-400"}`}>{s}</button>
        ))}
      </div>
      <Input label="Title" maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <textarea rows={5} maxLength={500} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className="input-glass resize-none text-sm" />
      <div className="grid grid-cols-3 gap-3">
        <select className="input-glass [&>option]:bg-navy-800" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>
          <option value="area">This area</option><option value="all">Everyone</option>
        </select>
        <Input type="number" min={0.5} max={100} step={0.5} value={f.radiusKm} onChange={(e) => setF({ ...f, radiusKm: Number(e.target.value) })} disabled={f.scope === "all"} placeholder="km" />
        <Input type="number" min={1} max={48} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} placeholder="hours" />
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-300">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 accent-ark-coral" />
        I have reviewed this text and I am authorised to issue it.
      </label>
      <Button variant="danger" onClick={send} loading={busy} disabled={!ok} className="w-full">Issue advisory</Button>

      {active.length > 0 && (
        <div className="space-y-2 border-t border-white/10 pt-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Active advisories</p>
          {active.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm">
              <Badge tone={a.severity === "watch" ? "indigo" : "coral"}>{a.severity}</Badge>
              <span className="min-w-0 flex-1 truncate">{a.title} <span className="text-xs text-slate-500">· {a.scope === "all" ? "everyone" : `${(a.radiusM / 1000).toFixed(1)} km`} · {timeAgo(a.issuedAt)}</span></span>
              <button onClick={() => advisoryApi.withdraw(a.id).then(() => { toast.success("Withdrawn"); load(); }).catch((e) => toast.error(errMsg(e)))} className="rounded-lg p-1.5 text-slate-500 hover:text-ark-coral" title="Withdraw"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}