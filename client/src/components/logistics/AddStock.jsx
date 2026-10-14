import { useState } from "react";
import { PackagePlus } from "lucide-react";
import toast from "react-hot-toast";
import { logisticsApi } from "../../services/logisticsService";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";
import { RES } from "./logMeta";

const EMPTY = { water: "", rations: "", medical: "" };

export default function AddStock({ untracked, onSaved }) {
  const [id, setId] = useState("");
  const [v, setV] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!id) return toast.error("Choose a facility");
    const body = {};
    for (const k of Object.keys(RES)) {
      const n = Number(v[k]);
      if (v[k] === "" || !Number.isFinite(n) || n < 0) return toast.error(`Enter a valid ${RES[k].label.toLowerCase()} quantity (0 or more)`);
      body[k] = n;
    }
    setBusy(true);
    try {
      await logisticsApi.setInventory(id, body);
      toast.success("Stock recorded");
      setId("");
      setV(EMPTY);
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard className="space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><PackagePlus size={16} className="text-ark-cyan" /> Start tracking a facility ({untracked.length} untracked)</p>
      <form onSubmit={submit} className="space-y-3">
        <select className="input-glass [&>option]:bg-navy-800" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Choose a facility…</option>
          {untracked.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.type})</option>)}
        </select>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(RES).map(([k, { label, unit }]) => (
            <label key={k} className="text-[11px] text-slate-400">{label} ({unit})
              <input type="number" min={0} className="input-glass !mt-1 !py-1.5 !text-sm" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <Button type="submit" loading={busy} className="w-full">Record stock</Button>
      </form>
    </GlassCard>
  );
}