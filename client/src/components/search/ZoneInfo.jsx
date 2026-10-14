import { Loader2, AlertTriangle, Info, RefreshCw, Compass } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";
import { ZONE_STYLE } from "./searchMeta";
import { timeAgo } from "../../utils/geo";

export default function ZoneInfo({ zone, loading, error, onRefresh }) {
  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-display text-lg font-semibold">Probable search zones</h3>
        <Button variant="ghost" onClick={onRefresh} disabled={loading} className="ml-auto !px-3 !py-1.5 !text-xs">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recompute
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-ark-indigo/40 bg-ark-indigo/10 px-4 py-3 text-xs text-indigo-200">
        <Info size={15} className="mt-0.5 shrink-0" />
        Area guidance for deploying aerial and canine teams, not exact tracking. The percentages describe the model's own simulation under stated assumptions, not a validated chance of finding someone.
      </div>

      {error && <p className="flex items-center gap-2 text-sm text-ark-coral"><AlertTriangle size={15} /> {error}</p>}
      {loading && !zone && <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Simulating drift over terrain…</p>}

      {zone && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {zone.zones.map((z) => (
              <div key={z.p} className="rounded-xl bg-white/5 p-3 text-center" style={{ borderTop: `3px solid ${ZONE_STYLE[z.p].hex}` }}>
                <p className="font-display text-xl font-bold" style={{ color: ZONE_STYLE[z.p].hex }}>{ZONE_STYLE[z.p].label}</p>
                <p className="text-xs text-slate-300">{z.area_km2} km²</p>
              </div>
            ))}
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-white/5 px-3 py-2"><span className="text-slate-400">Time simulated: </span>{Math.round(zone.simulated_min)} min</div>
            <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2"><Compass size={14} className="text-ark-cyan" /> Drift {zone.drift.distance_m} m toward {zone.drift.bearing_deg}°</div>
          </div>

          {zone.warnings.length > 0 && (
            <div className="space-y-2">
              {zone.warnings.map((w) => (
                <p key={w} className="flex items-start gap-2 rounded-xl border border-ark-coral/40 bg-ark-coral/10 px-3 py-2 text-xs text-ark-coral"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}</p>
              ))}
            </div>
          )}

          <details>
            <summary className="cursor-pointer text-sm font-semibold text-ark-cyan">Assumptions and data</summary>
            <div className="mt-3 space-y-2 text-xs text-slate-400">
              <p><b className="text-slate-300">Terrain:</b> {zone.sources.elevation}</p>
              <p><b className="text-slate-300">Flow speed:</b> {zone.params.flow_speed_ms} m/s ({zone.params.flow_speed_source})</p>
              <p><b className="text-slate-300">Flow direction:</b> {zone.params.flow_direction_source}{zone.params.flow_bearing_deg != null ? ` (${zone.params.flow_bearing_deg}°)` : ""}</p>
              <p><b className="text-slate-300">Position uncertainty:</b> about {zone.params.accuracy_m} m · {zone.params.particles} simulated paths</p>
              <ul className="list-disc space-y-1 pl-5">{zone.model.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
              <p><b className="text-slate-300">Model:</b> {zone.model.name}. Not validated against real search outcomes.</p>
              <p>Computed {timeAgo(zone.generated_at)}.</p>
            </div>
          </details>
        </>
      )}
    </GlassCard>
  );
}