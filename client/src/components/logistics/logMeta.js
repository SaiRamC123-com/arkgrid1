import { Droplets, Utensils, Stethoscope } from "lucide-react";

export const RES = {
  water: { label: "Water", unit: "L", icon: Droplets },
  rations: { label: "Rations", unit: "meals", icon: Utensils },
  medical: { label: "Medical", unit: "kits", icon: Stethoscope },
};

export const levelOf = (h, th) => (h === null ? "na" : h < th.critH ? "crit" : h < th.warnH ? "warn" : "ok");
export const LEVEL = {
  crit: { hex: "#FF5A6E", label: "Critical" }, warn: { hex: "#6366F1", label: "Low" },
  ok: { hex: "#22D3EE", label: "OK" }, na: { hex: "#64748B", label: "No demand" },
};
export const fmtH = (h) => (h === null || h === undefined ? "n/a" : h < 1 ? "<1 h" : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} d`);