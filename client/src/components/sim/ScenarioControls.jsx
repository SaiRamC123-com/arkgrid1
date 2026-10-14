import { CloudRain, Waves, MapPin, Crosshair } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";

const Slider = ({ label, value, min, max, step, unit, onChange, accent }) => (
  <div>
    <div className="mb-1 flex justify-between text-xs uppercase tracking-wider text-slate-400">
      <span>{label}</span><span style={{ color: accent }}>{value} {unit}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: accent }} />
  </div>
);

export default function ScenarioControls({ p, setP, source, picking, onPickCenter, onPickSource, onUseGps, canGps }) {
  const set = (k) => (v) => setP({ ...p, [k]: v });
  return (
    <GlassCard className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
        {[["rain", "Rainfall", CloudRain], ["surge", "Water surge", Waves]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setP({ ...p, mode: k })}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${p.mode === k ? "bg-gradient-to-r from-ark-indigo to-ark-cyan text-white" : "text-slate-400"}`}>
            <Icon size={16} /> {l}
          </button>
        ))}
      </div>

      {p.mode === "rain" ? (
        <div className="space-y-4">
          <Slider label="Rain intensity" value={p.intensity} min={5} max={100} step={5} unit="mm/h" accent="#22D3EE" onChange={set("intensity")} />
          <Slider label="Duration" value={p.hours} min={1} max={12} step={1} unit="h" accent="#6366F1" onChange={set("hours")} />
          <Slider label="Rain already fallen" value={p.antecedent} min={0} max={200} step={10} unit="mm" accent="#B160AF" onChange={set("antecedent")} />
        </div>
      ) : (
        <div className="space-y-4">
          <Slider label="Surge above current level" value={p.height} min={0.5} max={5} step={0.5} unit="m" accent="#FF5A6E" onChange={set("height")} />
          <Slider label="Rise rate" value={p.rise} min={0.1} max={2} step={0.1} unit="m/h" accent="#6366F1" onChange={set("rise")} />
          <Slider label="Walking speed (for trap analysis)" value={p.walk} min={0.4} max={1.4} step={0.1} unit="m/s" accent="#22D3EE" onChange={set("walk")} />
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Where does the water come from?</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setP({ ...p, srcMode: "lowest" })} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${p.srcMode === "lowest" ? "border-ark-cyan bg-ark-cyan/15 text-ark-cyan" : "border-white/10 text-slate-400"}`}>Lowest ground (assumed)</button>
              <button onClick={onPickSource} className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${picking === "source" ? "border-ark-coral bg-ark-coral/15 text-ark-coral" : p.srcMode === "pick" && source ? "border-ark-cyan bg-ark-cyan/15 text-ark-cyan" : "border-white/10 text-slate-400"}`}>
                <MapPin size={13} /> {picking === "source" ? "Tap the river or coast…" : source ? "River point set" : "Pick river point"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Area radius" value={p.radiusKm} min={1} max={8} step={0.5} unit="km" accent="#22D3EE" onChange={set("radiusKm")} />
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">Detail</p>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
            {[["Fast", 10], ["Balanced", 14], ["Fine", 20]].map(([l, v]) => (
              <button key={v} onClick={() => setP({ ...p, grid: v })} className={`rounded-lg py-1.5 text-xs font-semibold ${p.grid === v ? "bg-gradient-to-r from-ark-indigo to-ark-cyan text-white" : "text-slate-400"}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="ghost" onClick={onUseGps} disabled={!canGps}><Crosshair size={15} /> My location</Button>
        <Button variant={picking === "center" ? "danger" : "ghost"} onClick={onPickCenter}><MapPin size={15} /> {picking === "center" ? "Tap the map…" : "Pick centre"}</Button>
      </div>
    </GlassCard>
  );
}