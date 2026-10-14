import { useState, useSyncExternalStore } from "react";
import { Plus, Radio, Trash2, LogIn, LogOut, Crosshair, Clock, Users } from "lucide-react";
import toast from "react-hot-toast";
import { teamApi } from "../../services/opsService";
import { getTele, setTele, subscribeTele } from "../../utils/teleFlag";
import { errMsg } from "../../utils/errMsg";
import { timeAgo } from "../../utils/geo";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { TEAM_STATUS, TEAM_TYPES } from "./opsMeta";
import { SEV } from "../incidents/incidentMeta";

const sel = "input-glass !py-1.5 !text-xs [&>option]:bg-navy-800";

export default function TeamPanel({ teams, incidents, me, isCommander, onChanged, onFocus }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", type: "rescue", size: 4 });
  const [busyId, setBusyId] = useState(null);
  const tele = useSyncExternalStore(subscribeTele, getTele);

  const myTeam = teams.find((t) => t.id === me.teamId);
  const sorted = [...teams].sort((a, b) => Number(b.id === me.teamId) - Number(a.id === me.teamId) || a.name.localeCompare(b.name));
  const open = [...incidents].sort((a, b) => SEV[b.severity].rank - SEV[a.severity].rank);

  const run = async (id, fn, ok) => {
    setBusyId(id);
    try {
      await fn();
      if (ok) toast.success(ok);
      onChanged();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusyId(null);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    await run("new", () => teamApi.create({ ...f, size: Number(f.size) }), "Team created");
    setF({ name: "", type: "rescue", size: 4 });
    setAdding(false);
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Users size={19} className="text-ark-cyan" /> Rescue teams</h3>
        {isCommander && (
          <button onClick={() => setAdding((a) => !a)} className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10">
            <Plus size={14} /> Team
          </button>
        )}
      </div>

      {myTeam ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ark-cyan/40 bg-ark-cyan/10 px-4 py-3 text-sm">
          <span>You are in <b>{myTeam.name}</b></span>
          <div className="flex gap-2">
            <button onClick={() => setTele(!tele)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${tele ? "border-ark-cyan bg-ark-cyan/20 text-ark-cyan shadow-glow-cyan" : "border-white/15 bg-white/5"}`}>
              <Radio size={13} className={tele ? "animate-pulse" : ""} /> {tele ? "Sharing live location" : "Share my location"}
            </button>
            <button onClick={() => run("leave", () => teamApi.leave(), "Left the team")} className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">Join a team below to share your live position with command.</p>
      )}

      {adding && isCommander && (
        <form onSubmit={create} className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <Input label="Team name" placeholder="e.g. Alpha Rescue" maxLength={40} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <select className="input-glass [&>option]:bg-navy-800" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {Object.entries(TEAM_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <Input type="number" min={1} max={50} placeholder="People" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} />
          </div>
          <Button type="submit" loading={busyId === "new"} className="w-full">Create team</Button>
        </form>
      )}

      <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
        {sorted.length === 0 && <p className="text-sm text-slate-500">No teams yet.{isCommander ? " Create one or load demo ops data." : ""}</p>}
        {sorted.map((t) => {
          const st = TEAM_STATUS[t.status];
          const ty = TEAM_TYPES[t.type];
          const Icon = ty.icon;
          const mine = t.id === me.teamId;
          const busy = busyId === t.id;
          return (
            <div key={t.id} className={`rounded-2xl border p-4 ${mine ? "border-ark-cyan/50 bg-ark-cyan/[0.06]" : "border-white/10 bg-white/5"}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-navy-900" style={{ background: st.hex, opacity: t.stale ? 0.5 : 1 }}><Icon size={19} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.name}{t.demo && <span className="ml-2 text-xs text-slate-400">(demo)</span>}</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                    <span>{ty.label} · {t.size} people</span>
                    <span className={`flex items-center gap-1 ${t.stale ? "text-ark-coral" : ""}`}><Clock size={12} /> {t.locationAt ? `seen ${timeAgo(t.locationAt)}` : "no telemetry"}</span>
                  </p>
                </div>
                <Badge tone={st.tone}>{st.label}</Badge>
                {t.location && <button onClick={() => onFocus(t.location)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-ark-cyan"><Crosshair size={16} /></button>}
              </div>

              {(t.assignedIncidentCode || t.assignmentClosed) && (
                <p className="mt-2 text-xs text-indigo-300">{t.assignmentClosed ? "Assigned incident has closed" : `Assigned to INC-${t.assignedIncidentCode}`}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(isCommander || mine) && (
                  <select className={sel} disabled={busy} value={t.status} onChange={(e) => run(t.id, () => teamApi.update(t.id, { status: e.target.value }))}>
                    {Object.entries(TEAM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                )}
                {isCommander && (
                  <select className={sel} disabled={busy} value={t.assignedIncidentId || ""}
                    onChange={(e) => run(t.id, () => teamApi.assign(t.id, e.target.value || null), e.target.value ? "Team dispatched" : "Team unassigned")}>
                    <option value="">Unassigned</option>
                    {open.map((i) => <option key={i.id} value={i.id}>INC-{i.code} · {SEV[i.severity].label} · {i.title}</option>)}
                  </select>
                )}
                {!mine && (
                  <button disabled={busy} onClick={() => run(t.id, () => teamApi.join(t.id), `Joined ${t.name}`)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"><LogIn size={13} /> Join</button>
                )}
                {isCommander && (
                  <button disabled={busy} onClick={() => window.confirm(`Delete ${t.name}?`) && run(t.id, () => teamApi.remove(t.id), "Team deleted")}
                    className="ml-auto rounded-lg p-1.5 text-slate-500 hover:text-ark-coral"><Trash2 size={15} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}