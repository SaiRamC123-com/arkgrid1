import { useState } from "react";
import { MapPin, User, Crosshair } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "../ui/GlassCard";
import Input from "../ui/Input";
import Button from "../ui/Button";
import { SITUATIONS, COMPASS, SPEEDS } from "./searchMeta";

const QUICK = [15, 30, 60, 120, 360];

export default function CaseForm({ coords, prefill, gps, onUseGps, onSubmit, onCancel }) {
  const [f, setF] = useState({
    name: prefill?.name || "", situation: prefill?.situation || "water_borne", minAgo: prefill?.minAgo ?? 60,
    accuracy: 50, bearing: "", speedClass: "", note: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!prefill?.sosId && !coords) return toast.error("Tap the map to set the last known location");
    setSaving(true);
    try {
      await onSubmit({
        name: f.name, situation: f.situation, note: f.note,
        ...(prefill?.sosId ? { sosId: prefill.sosId } : { lat: coords.lat, lng: coords.lng, lastSeenMinAgo: Number(f.minAgo), accuracy: Number(f.accuracy) }),
        flow: f.bearing !== "" || f.speedClass !== "" ? { bearing: f.bearing === "" ? null : Number(f.bearing), speedClass: f.speedClass || null } : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard>
      <h3 className="font-display text-lg font-semibold">{prefill?.sosId ? "Search case from lost-contact SOS" : "New search case"}</h3>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
        <MapPin size={13} className="text-ark-coral" />
        {coords ? `Last known location: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}${prefill?.sosId ? "" : " · tap the map to move"}` : "Tap the map to set the last known location"}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Input label="Person or group" icon={User} maxLength={60} placeholder="e.g. Ramesh K., age 67" value={f.name} onChange={set("name")} required />

        <div className="grid grid-cols-3 gap-2">
          {Object.entries(SITUATIONS).map(([id, { label, icon: Icon }]) => (
            <button type="button" key={id} onClick={() => setF({ ...f, situation: id })}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-semibold transition ${f.situation === id ? "border-ark-cyan bg-ark-cyan/15 text-ark-cyan shadow-glow-cyan" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}>
              <Icon size={20} /> {label}
            </button>
          ))}
        </div>
        <p className="-mt-2 text-xs text-slate-500">{SITUATIONS[f.situation].hint}</p>

        {!prefill?.sosId && (
          <>
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-400">Last seen how long ago?</p>
              <div className="flex flex-wrap gap-2">
                {QUICK.map((m) => (
                  <button type="button" key={m} onClick={() => setF({ ...f, minAgo: m })}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${Number(f.minAgo) === m ? "border-ark-cyan bg-ark-cyan/15 text-ark-cyan" : "border-white/10 text-slate-400 hover:bg-white/10"}`}>
                    {m < 60 ? `${m} min` : `${m / 60} h`}
                  </button>
                ))}
                <input type="number" min={0} max={4320} value={f.minAgo} onChange={set("minAgo")} className="input-glass !w-24 !py-1 !text-xs" />
                <span className="self-center text-xs text-slate-500">min</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Location accuracy (m)" type="number" min={0} max={2000} value={f.accuracy} onChange={set("accuracy")} />
              <div className="flex items-end"><Button type="button" variant="ghost" onClick={onUseGps} disabled={!gps} className="w-full"><Crosshair size={15} /> My location</Button></div>
            </div>
          </>
        )}

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Water flow (optional, if someone has assessed it)</p>
          <div className="grid grid-cols-2 gap-3">
            <select className="input-glass [&>option]:bg-navy-800" value={f.bearing} onChange={set("bearing")}>
              {COMPASS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="input-glass [&>option]:bg-navy-800" value={f.speedClass} onChange={set("speedClass")}>
              {SPEEDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <p className="mt-2 text-xs text-slate-500">Direction is where the water flows toward. Leave blank to follow the terrain downhill.</p>
        </div>

        <textarea rows={2} maxLength={200} value={f.note} onChange={set("note")} placeholder="Notes: clothing, vehicle, medical needs…" className="input-glass resize-none" />

        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={saving}>Create case</Button>
        </div>
      </form>
    </GlassCard>
  );
}