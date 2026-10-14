import { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Users } from "lucide-react";
import toast from "react-hot-toast";
import { logisticsApi } from "../../services/logisticsService";
import { errMsg } from "../../utils/errMsg";
import { timeAgo } from "../../utils/geo";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { RES, LEVEL, levelOf, fmtH } from "./logMeta";

export default function StockCard({ row, th, selected, onSelect, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({});
  const [busy, setBusy] = useState(false);
  const worst = levelOf(row.minRunwayH, th);

  const save = async () => {
    setBusy(true);
    try {
      await logisticsApi.setInventory(row.id, Object.fromEntries(Object.keys(RES).map((k) => [k, v[k] ?? row.inventory[k]])));
      toast.success("Stock updated");
      setEdit(false);
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} onClick={() => onSelect(row.id)} role="button"
      className={`glass cursor-pointer p-4 transition-all hover:bg-white/[0.08] ${selected ? "border-ark-cyan/70 shadow-glow-cyan" : worst === "crit" ? "border-ark-coral/50" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{row.name}{row.demo && <span className="ml-2 text-xs text-slate-400">(demo)</span>}</p>
          <p className="flex items-center gap-3 text-xs text-slate-400">
            <span className="capitalize">{row.type}</span>
            {row.persons > 0 ? <span className="flex items-center gap-1"><Users size={12} /> {row.persons} people</span> : <span>Supply point</span>}
          </p>
        </div>
        <Badge tone={worst === "crit" ? "coral" : worst === "warn" ? "indigo" : "cyan"}>{LEVEL[worst].label}</Badge>
      </div>

      <div className="mt-3 space-y-2.5">
        {Object.entries(RES).map(([k, { label, unit, icon: Icon }]) => {
          const r = row.res[k];
          const lv = LEVEL[levelOf(r.runwayH, th)];
          const pct = r.runwayH === null ? 100 : Math.min(100, (r.runwayH / (th.targetH * 1.5)) * 100);
          return (
            <div key={k} className="text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-300"><Icon size={13} /> {label}: {Math.round(r.stock)} {unit}</span>
                <span style={{ color: lv.hex }} className="font-semibold">{r.runwayH === null ? "no demand" : `~${fmtH(r.runwayH)}`}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: lv.hex }} /></div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500" onClick={(e) => e.stopPropagation()}>
        <span>{row.inventoryAt ? `Stock updated ${timeAgo(row.inventoryAt)}${row.inventoryBy ? ` by ${row.inventoryBy}` : ""}` : ""}</span>
        <button onClick={() => setEdit((x) => !x)} className="flex items-center gap-1 font-semibold text-ark-cyan hover:underline"><Pencil size={12} /> Update stock</button>
      </div>

      {edit && (
        <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(RES).map(([k, { label, unit }]) => (
              <label key={k} className="text-[11px] text-slate-400">{label} ({unit})
                <input type="number" min={0} className="input-glass !mt-1 !py-1.5 !text-sm" defaultValue={Math.round(row.inventory[k])} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <Button onClick={save} loading={busy} className="w-full">Save stock</Button>
        </div>
      )}
    </motion.div>
  );
}