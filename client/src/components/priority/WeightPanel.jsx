import { SlidersHorizontal, RotateCcw, Save } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { CRITERIA, KEYS } from "../../utils/mcda";

export default function WeightPanel({ weights, setWeights, saved, defaults, custom, canEdit, dirty, busy, onSave, onReset, meta }) {
  const total = KEYS.reduce((a, k) => a + weights[k], 0) || 1;
  return (
    <GlassCard>
      <details open={dirty}>
        <summary className="flex cursor-pointer items-center gap-2 font-display text-lg font-semibold">
          <SlidersHorizontal size={18} className="text-ark-cyan" /> Criteria weights
          {dirty && <Badge tone="coral">Preview, not saved</Badge>}
          {!dirty && custom && <Badge tone="cyan">Custom</Badge>}
        </summary>
        <div className="mt-4 space-y-4">
          {CRITERIA.map((c) => (
            <div key={c.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold" style={{ color: c.hex }}>{c.label}</span>
                <span className="text-slate-400">{Math.round((weights[c.key] / total) * 100)}% share</span>
              </div>
              <input type="range" min={0} max={100} step={5} value={Math.round(weights[c.key] * 100)} disabled={!canEdit && false}
                onChange={(e) => setWeights({ ...weights, [c.key]: Number(e.target.value) / 100 })}
                className="w-full" style={{ accentColor: c.hex }} />
              <p className="text-[11px] text-slate-500">{c.hint}</p>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            Anyone can drag the sliders to preview. {canEdit ? "Save to make them the shared default for all staff." : "Only commanders can save shared weights."}
            {custom && meta?.by ? ` Saved by ${meta.by}.` : ""}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={() => setWeights({ ...saved })} disabled={!dirty}><RotateCcw size={15} /> Undo preview</Button>
            {canEdit ? (
              <Button onClick={onSave} loading={busy} disabled={!dirty}><Save size={15} /> Save weights</Button>
            ) : (
              <Button variant="ghost" onClick={() => setWeights({ ...defaults })}>Try defaults</Button>
            )}
          </div>
          {canEdit && custom && <button onClick={onReset} className="w-full text-xs font-semibold text-ark-coral hover:underline">Reset shared weights to defaults</button>}
        </div>
      </details>
    </GlassCard>
  );
}