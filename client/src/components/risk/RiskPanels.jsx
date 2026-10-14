import { CloudRain, Mountain, X, Info } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import { TIERS } from "./riskMeta";

export function TierBar({ summary }) {
  return (
    <GlassCard>
      <h3 className="font-display text-lg font-semibold">Risk mask</h3>
      <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-white/10">
        {summary.pct.map((p, i) => (
          <div key={i} style={{ width: `${p}%`, background: TIERS[i].hex }} title={`${TIERS[i].label} ${p}%`} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {TIERS.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: t.hex }} /> {t.label}</span>
            <span className="text-slate-400">{summary.pct[t.id]}%</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Share of the analysed area in each tier. Tiers are relative susceptibility, not water depth or arrival time.</p>
    </GlassCard>
  );
}

export function RainPanel({ inputs, sources }) {
  const w = inputs.weather;
  return (
    <GlassCard>
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><CloudRain size={19} className="text-ark-cyan" /> Rainfall used</h3>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/5 p-3">
          <p className="font-display text-2xl font-bold text-ark-cyan">{inputs.rain_24h_mm}<span className="text-sm text-slate-400"> mm</span></p>
          <p className="text-xs text-slate-400">24 h total</p>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <p className="font-display text-2xl font-bold text-indigo-300">{inputs.rain_1h_mm}<span className="text-sm text-slate-400"> mm/h</span></p>
          <p className="text-xs text-slate-400">Peak hourly</p>
        </div>
      </div>
      {w && (
        <p className="mt-3 text-xs text-slate-400">Past 24 h: {w.past24_mm} mm · Next 24 h: {w.next24_mm} mm · Now: {w.now_mm} mm/h</p>
      )}
      <p className="mt-2 text-xs text-slate-500">Source: {sources.rain}</p>
    </GlassCard>
  );
}

export function CellDetail({ cell, onClose }) {
  const t = TIERS[cell.tier];
  return (
    <GlassCard className="space-y-4" style={{ borderColor: `${t.hex}88` }}>
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-navy-900" style={{ background: t.hex }}>
          <Mountain size={22} />
        </div>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-slate-400">Selected cell</p>
          <p className="font-display text-xl font-bold">{t.label} susceptibility</p>
          <Badge tone={t.tone}>Score {Math.round(cell.score * 100)}%</Badge>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10"><X size={18} /></button>
      </div>

      {cell.p && (
        <div className="space-y-1.5">
          {TIERS.map((x) => (
            <div key={x.id} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-slate-400">{x.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${cell.p[x.id] * 100}%`, background: x.hex }} />
              </div>
              <span className="w-10 text-right text-slate-400">{Math.round(cell.p[x.id] * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Elevation", `${cell.elev} m`], ["Slope", `${cell.slope}°`], ["Relief", `${cell.relief > 0 ? "+" : ""}${cell.relief} m`]].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-white/5 p-2">
            <p className="font-semibold">{v}</p>
            <p className="text-[11px] text-slate-400">{l}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Relief below zero means the cell sits lower than its surroundings, where water collects.</p>
    </GlassCard>
  );
}

export function ModelCard({ result }) {
  const { sources, model, inputs, cell } = result;
  const rows = [
    ["Terrain", sources.elevation],
    ["Rainfall", sources.rain],
    ["Soil", sources.soil],
    ["Grid cell", `about ${cell.size_m} m`],
    ["Model", `Gradient-boosted classifier · ${model.mode === "tier4" ? "4-tier" : "binary, mapped to tiers"}`],
    ["Trained on", model.trained_on],
    ["Real-world validation", "None yet"],
  ];
  return (
    <GlassCard>
      <details>
        <summary className="flex cursor-pointer items-center gap-2 font-display text-lg font-semibold">
          <Info size={18} className="text-ark-indigo" /> Data and model card
        </summary>
        <div className="mt-4 space-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 rounded-xl bg-white/5 px-3 py-2">
              <span className="shrink-0 text-slate-400">{k}</span>
              <span className="text-right">{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {model.kind === "synthetic-heuristic"
            ? "This model was trained on synthetic labels generated from a documented heuristic, so it reproduces our assumptions rather than observed floods. "
            : "This model was trained on a supplied dataset and has not been independently benchmarked. "}
          Slope and relief are coarse at this resolution, and soil permeability is assumed. Benchmark against public datasets such as Copernicus EMS flood extents before relying on it.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Contains Copernicus DEM GLO-90 elevation data and weather data, both served by Open-Meteo.com.
        </p>
      </details>
    </GlassCard>
  );
}