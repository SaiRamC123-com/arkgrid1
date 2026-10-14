import { useState } from "react";
import { Trash2, MapPin, Phone, Type, Home } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "../ui/GlassCard";
import Input from "../ui/Input";
import Button from "../ui/Button";
import { TYPE_META, RES_META, LEVEL_META } from "./shelterMeta";

export default function ShelterEditor({ initial, coords, onSave, onCancel, onDelete }) {
  const [f, setF] = useState(() => ({
    type: initial?.type || "shelter",
    name: initial?.name || "",
    address: initial?.address || "",
    phone: initial?.phone || "",
    capacity: initial?.capacity ?? 0,
    occupied: initial?.occupied ?? 0,
    status: initial?.status || "open",
    resources: { water: "ok", food: "ok", medical: "ok", power: "ok", ...(initial?.resources || {}) },
  }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!coords) return toast.error("Tap the map to set the location");
    const capacity = Number(f.capacity) || 0;
    const occupied = Number(f.occupied) || 0;
    if (capacity > 0 && occupied > capacity) return toast.error("Occupied cannot exceed capacity");
    setSaving(true);
    try {
      await onSave({ ...f, capacity, occupied, lat: coords.lat, lng: coords.lng });
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard>
      <h3 className="font-display text-lg font-semibold">{initial ? "Edit facility" : "Add facility"}</h3>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
        <MapPin size={13} className="text-ark-coral" />
        {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} · tap the map to move` : "Tap the map to place it"}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(TYPE_META).map(([id, { label, icon: Icon }]) => (
            <button type="button" key={id} onClick={() => setF({ ...f, type: id })}
              className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition ${
                f.type === id ? "border-ark-cyan bg-ark-cyan/15 text-ark-cyan" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}>
              <Icon size={19} /> {label}
            </button>
          ))}
        </div>

        <Input label="Name" icon={Type} value={f.name} onChange={set("name")} maxLength={80} required />
        <Input label="Address" icon={Home} value={f.address} onChange={set("address")} maxLength={120} />
        <Input label="Phone" icon={Phone} type="tel" value={f.phone} onChange={set("phone")} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Capacity" type="number" min={0} value={f.capacity} onChange={set("capacity")} />
          <Input label="Occupied" type="number" min={0} value={f.occupied} onChange={set("occupied")} />
        </div>
        <p className="-mt-2 text-xs text-slate-500">Set capacity to 0 if this point does not track beds or places.</p>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
          {[["open", "Open"], ["closed", "Closed"]].map(([v, l]) => (
            <button type="button" key={v} onClick={() => setF({ ...f, status: v })}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                f.status === v ? "bg-gradient-to-r from-ark-indigo to-ark-cyan text-white" : "text-slate-400"
              }`}>
              {l}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Resource levels</p>
          {Object.entries(RES_META).map(([k, { label, icon: RIcon }]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-slate-300"><RIcon size={15} /> {label}</span>
              <div className="flex gap-1.5">
                {Object.entries(LEVEL_META).map(([lvl, m]) => (
                  <button type="button" key={lvl}
                    onClick={() => setF({ ...f, resources: { ...f.resources, [k]: lvl } })}
                    className={`rounded-lg border px-3 py-1 text-xs font-bold transition ${
                      f.resources[k] === lvl ? m.cls : "border-white/10 text-slate-500 hover:bg-white/5"
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={saving}>Save</Button>
        </div>
        {onDelete && (
          <button type="button" onClick={onDelete}
            className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-ark-coral hover:underline">
            <Trash2 size={15} /> Remove facility
          </button>
        )}
      </form>
    </GlassCard>
  );
}