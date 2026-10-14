import { useState } from "react";
import { Undo2, Eraser, Route } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "../ui/GlassCard";
import Input from "../ui/Input";
import Button from "../ui/Button";
import { ROAD_STATUS } from "./roadMeta";
import { distanceM, fmtDistance } from "../../utils/geo";

export default function RoadEditor({ points, status, setStatus, onUndo, onClear, onSubmit, onCancel }) {
  const [name, setName] = useState("");
  const [depth, setDepth] = useState(30);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const length = points.reduce((t, p, i) => (i ? t + distanceM(points[i - 1], p) : 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (points.length < 2) return toast.error("Tap at least 2 points along the road");
    if (length < 15) return toast.error("Draw a longer stretch (at least 15 m)");
    setSaving(true);
    try {
      await onSubmit({ name, status, depthCm: status === "flooded" ? depth : null, note, coords: points });
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard>
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Route size={19} className="text-ark-cyan" /> Mark a road</h3>
      <p className="mt-1 text-xs text-slate-400">
        Tap the map along the road. {points.length} point{points.length === 1 ? "" : "s"}{length > 0 && ` · ${fmtDistance(length)}`}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(ROAD_STATUS).map(([id, { label, icon: Icon, hex }]) => (
            <button type="button" key={id} onClick={() => setStatus(id)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition ${
                status === id ? "bg-white/10 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
              style={status === id ? { borderColor: hex, boxShadow: `0 0 20px ${hex}55` } : undefined}>
              <Icon size={20} style={{ color: hex }} /> {label}
            </button>
          ))}
        </div>

        <Input label="Road name" placeholder="e.g. MG Road near bus stand" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />

        {status === "flooded" && (
          <div>
            <div className="mb-1.5 flex justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>Water depth (estimate)</span><span className="text-indigo-300">{depth} cm</span>
            </div>
            <input type="range" min={5} max={200} step={5} value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-full accent-ark-indigo" />
          </div>
        )}

        <textarea rows={2} maxLength={150} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="input-glass resize-none" />

        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="ghost" onClick={onUndo} disabled={!points.length}><Undo2 size={16} /> Undo</Button>
          <Button type="button" variant="ghost" onClick={onClear} disabled={!points.length}><Eraser size={16} /> Clear</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={saving}>Submit</Button>
        </div>
      </form>
    </GlassCard>
  );
}