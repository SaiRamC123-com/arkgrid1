import { Building2, HeartPulse, Package, Droplets, Utensils, Stethoscope, Zap } from "lucide-react";

export const TYPE_META = {
  shelter: { label: "Shelter", plural: "Shelters", icon: Building2, letter: "S" },
  hospital: { label: "Hospital", plural: "Hospitals", icon: HeartPulse, letter: "H" },
  relief: { label: "Relief point", plural: "Relief", icon: Package, letter: "R" },
};

// Pin color = availability (cyan good, indigo filling, coral full)
export const AVAIL_META = {
  open: { label: "Available", tone: "cyan", hex: "#22D3EE", bar: "from-ark-cyan to-ark-indigo" },
  limited: { label: "Filling up", tone: "indigo", hex: "#6366F1", bar: "from-ark-indigo to-ark-cyan" },
  full: { label: "Full", tone: "coral", hex: "#FF5A6E", bar: "from-ark-coral to-ark-indigo" },
  closed: { label: "Closed", tone: "coral", hex: "#64748B", bar: "from-slate-500 to-slate-600" },
  unknown: { label: "Status unconfirmed", tone: "slate", hex: "#94A3B8", bar: "from-slate-500 to-slate-400" },
};

export const RES_META = {
  water: { label: "Water", icon: Droplets },
  food: { label: "Food", icon: Utensils },
  medical: { label: "Medical", icon: Stethoscope },
  power: { label: "Power", icon: Zap },
};

export const LEVEL_META = {
  ok: { label: "OK", cls: "border-ark-cyan/40 bg-ark-cyan/10 text-ark-cyan" },
  low: { label: "Low", cls: "border-ark-indigo/50 bg-ark-indigo/15 text-indigo-300" },
  out: { label: "Out", cls: "border-ark-coral/50 bg-ark-coral/15 text-ark-coral" },
};