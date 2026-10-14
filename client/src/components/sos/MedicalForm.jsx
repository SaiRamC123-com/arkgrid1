import { useEffect, useState } from "react";
import { HeartPulse, Plus, Trash2, Phone, User } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Button from "../ui/Button";
import Input from "../ui/Input";

const BLOOD = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const MOBILITY = [
  ["none", "No mobility issue"], ["limited", "Limited mobility"],
  ["wheelchair", "Wheelchair user"], ["bedridden", "Bedridden"],
];
const VULN = [
  ["child", "Child"], ["elderly", "Elderly"], ["pregnant", "Pregnant"],
  ["disability", "Disability"], ["chronic", "Chronic illness"],
];
const empty = {
  bloodGroup: "", mobility: "none", vulnerabilities: [],
  conditions: "", allergies: "", medications: "", contacts: [],
};

export default function MedicalForm({ initial, onSave }) {
  const [form, setForm] = useState({ ...empty, ...initial });
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm({ ...empty, ...initial }), [initial]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleVuln = (v) =>
    setForm({
      ...form,
      vulnerabilities: form.vulnerabilities.includes(v)
        ? form.vulnerabilities.filter((x) => x !== v)
        : [...form.vulnerabilities, v],
    });
  const setContact = (i, k, v) =>
    setForm({ ...form, contacts: form.contacts.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)) });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard>
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
        <HeartPulse size={20} className="text-ark-coral" /> Medical info and contacts
      </h3>
      <p className="mt-1 text-xs text-slate-400">Attached to your SOS so responders know how to help you.</p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Blood group</span>
            <select value={form.bloodGroup} onChange={set("bloodGroup")} className="input-glass [&>option]:bg-navy-800">
              {BLOOD.map((b) => <option key={b} value={b}>{b || "Unknown"}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Mobility</span>
            <select value={form.mobility} onChange={set("mobility")} className="input-glass [&>option]:bg-navy-800">
              {MOBILITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {VULN.map(([v, l]) => (
            <button type="button" key={v} onClick={() => toggleVuln(v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                form.vulnerabilities.includes(v)
                  ? "border-ark-coral bg-ark-coral/20 text-ark-coral"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}>
              {l}
            </button>
          ))}
        </div>

        {[["conditions", "Medical conditions"], ["allergies", "Allergies"], ["medications", "Medications"]].map(([k, l]) => (
          <label key={k} className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">{l}</span>
            <textarea rows={2} maxLength={300} value={form[k]} onChange={set(k)} className="input-glass resize-none" />
          </label>
        ))}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Emergency contacts (max 3)</p>
          <div className="space-y-3">
            {form.contacts.map((c, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input icon={User} placeholder="Name" value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} />
                  <Input icon={Phone} placeholder="Phone" value={c.phone} onChange={(e) => setContact(i, "phone", e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <input className="input-glass" placeholder="Relation (e.g. Brother)" maxLength={30}
                    value={c.relation} onChange={(e) => setContact(i, "relation", e.target.value)} />
                  <button type="button" onClick={() => setForm({ ...form, contacts: form.contacts.filter((_, x) => x !== i) })}
                    className="rounded-xl px-3 text-slate-500 hover:text-ark-coral">
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {form.contacts.length < 3 && (
            <button type="button"
              onClick={() => setForm({ ...form, contacts: [...form.contacts, { name: "", phone: "", relation: "" }] })}
              className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-ark-cyan hover:underline">
              <Plus size={15} /> Add contact
            </button>
          )}
        </div>

        <Button type="submit" loading={saving} className="w-full">Save medical profile</Button>
      </form>
    </GlassCard>
  );
}