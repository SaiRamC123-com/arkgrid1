import { useState } from "react";
import { Settings2, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { logisticsApi } from "../../services/logisticsService";
import { errMsg } from "../../utils/errMsg";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";
import { RES } from "./logMeta";

export default function RatesPanel({ data, canEdit, onSaved }) {
  const [rates, setRates] = useState(data.rates);
  const [th, setTh] = useState({ warnH: data.thresholds.warnH, critH: data.thresholds.critH, targetH: data.thresholds.targetH, maxKm: data.thresholds.maxKm });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try { await logisticsApi.saveConfig({ rates, thresholds: th }); toast.success("Assumptions saved"); onSaved(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };

  const field = (obj, set, k, label, hint, step = 1) => (
    <label key={k} className="text-xs text-slate-400">{label}
      <input type="number" min={0} step={step} disabled={!canEdit} value={obj[k]} onChange={(e) => set({ ...obj, [k]: Number(e.target.value) })} className="input-glass !mt-1 !py-1.5 !text-sm disabled:opacity-60" />
      <span className="text-[10px] text-slate-500">{hint}</span>
    </label>
  );

  return (
    <GlassCard>
      <details>
        <summary className="flex cursor-pointer items-center gap-2 font-display text-lg font-semibold"><Settings2 size={18} className="text-ark-cyan" /> Planning assumptions {data.custom && <span className="text-xs font-normal text-ark-cyan">custom</span>}</summary>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(RES).map(([k, { label, unit }]) => field(rates, setRates, k, `${label} / person / day`, unit, k === "medical" ? 0.01 : 0.5))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {field(th, setTh, "warnH", "Warn below (h)", "runway")}
            {field(th, setTh, "critH", "Critical below (h)", "runway")}
            {field(th, setTh, "targetH", "Top up to (h)", "runway target")}
            {field(th, setTh, "maxKm", "Max transfer (km)", "straight-line")}
          </div>
          <p className="text-xs text-slate-500">Water and rations default to commonly used humanitarian planning minimums. The medical rate is a placeholder. Confirm all of them with your agency. {data.by && data.custom ? `Last saved by ${data.by}.` : ""}</p>
          {canEdit && (
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={save} loading={busy}>Save assumptions</Button>
              <Button variant="ghost" onClick={() => logisticsApi.resetConfig().then(() => { toast.success("Reset to defaults"); onSaved(); }).catch((e) => toast.error(errMsg(e)))}><RotateCcw size={15} /> Defaults</Button>
            </div>
          )}
        </div>
      </details>
    </GlassCard>
  );
}