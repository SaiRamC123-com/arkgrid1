import { useState } from "react";
import { Plus, Trash2, MapPin, Zap, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { infraApi } from "../../services/opsService";
import { errMsg } from "../../utils/errMsg";
import { timeAgo } from "../../utils/geo";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { INFRA_STATUS, INFRA_KINDS } from "./opsMeta";

const ORDER = { down: 0, degraded: 1, operational: 2 };

function Card({ x, isCommander, onFocus, run }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(x.note);
  const st = INFRA_STATUS[x.status];
  const Icon = INFRA_KINDS[x.kind].icon;

  return (
    <div className={`rounded-2xl border p-4 ${x.status === "down" ? "border-ark-coral/50 bg-ark-coral/[0.07]" : "border-white/10 bg-white/5"}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-navy-900" style={{ background: st.hex }}><Icon size={19} /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{x.name}{x.demo && <span className="ml-2 text-xs text-slate-400">(demo)</span>}</p>
          <p className="text-xs text-slate-400">{INFRA_KINDS[x.kind].label} · updated {timeAgo(x.updatedAt)}{x.updatedByName && ` by ${x.updatedByName}`}</p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
        <button onClick={() => onFocus({ lat: x.lat, lng: x.lng })} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-ark-cyan"><MapPin size={16} /></button>
      </div>

      {x.note && !editing && <p className="mt-2 text-sm text-slate-300">{x.note}</p>}
      {editing && (
        <div className="mt-3 flex gap-2">
          <input className="input-glass !py-1.5 text-sm" maxLength={150} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Status note" />
          <Button onClick={async () => { await run(() => infraApi.update(x.id, { note }), "Note saved"); setEditing(false); }}>Save</Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {Object.entries(INFRA_STATUS).map(([k, v]) => (
          <button key={k} disabled={x.status === k} onClick={() => run(() => infraApi.update(x.id, { status: k }), `Marked ${v.label}`)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-100 ${x.status === k ? "bg-white/10 text-white" : "border-white/10 text-slate-400 hover:bg-white/10"}`}
            style={x.status === k ? { borderColor: v.hex } : undefined}>
            {v.label}
          </button>
        ))}
        <button onClick={() => setEditing((e) => !e)} className="rounded-lg p-1.5 text-slate-400 hover:text-white"><Pencil size={14} /></button>
        {isCommander && (
          <button onClick={() => window.confirm(`Remove ${x.name}?`) && run(() => infraApi.remove(x.id), "Removed")} className="ml-auto rounded-lg p-1.5 text-slate-500 hover:text-ark-coral"><Trash2 size={15} /></button>
        )}
      </div>
    </div>
  );
}

export default function InfraPanel({ infra, isCommander, onChanged, onFocus, pick, onStartPick, onEndPick, gps }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", kind: "power", status: "operational", note: "" });
  const [saving, setSaving] = useState(false);
  const sorted = [...infra].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      onChanged();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const create = async (e) => {
    e.preventDefault();
    const point = pick?.point || gps;
    if (!point) return toast.error("Pick a location on the map first");
    setSaving(true);
    await run(() => infraApi.create({ ...f, lat: point.lat, lng: point.lng }), "Infrastructure added");
    setSaving(false);
    setAdding(false);
    setF({ name: "", kind: "power", status: "operational", note: "" });
    onEndPick();
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Zap size={19} className="text-ark-cyan" /> Critical infrastructure</h3>
        {isCommander && (
          <button onClick={() => { setAdding((a) => !a); onEndPick(); }} className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10">
            <Plus size={14} /> Add
          </button>
        )}
      </div>

      {adding && isCommander && (
        <form onSubmit={create} className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <Input label="Name" placeholder="e.g. North Pumping Station" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <select className="input-glass [&>option]:bg-navy-800" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {Object.entries(INFRA_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="input-glass [&>option]:bg-navy-800" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {Object.entries(INFRA_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
            <span>{pick?.point ? `Placed: ${pick.point.lat.toFixed(4)}, ${pick.point.lng.toFixed(4)}` : gps ? "Will use your current location" : "No location yet"}</span>
            <Button type="button" variant={pick ? "danger" : "ghost"} onClick={onStartPick}><MapPin size={14} /> {pick ? "Tap the map…" : "Pick on map"}</Button>
          </div>
          <Button type="submit" loading={saving} className="w-full">Add infrastructure</Button>
        </form>
      )}

      <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
        {sorted.length === 0 && <p className="text-sm text-slate-500">No infrastructure tracked yet.{isCommander ? " Add one, or load demo ops data." : ""}</p>}
        {sorted.map((x) => <Card key={x.id} x={x} isCommander={isCommander} onFocus={onFocus} run={run} />)}
      </div>
    </GlassCard>
  );
}