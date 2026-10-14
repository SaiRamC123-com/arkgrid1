import { Waves, Building2, Zap, LifeBuoy, AlertTriangle } from "lucide-react";

export const REPORT_TYPES = {
  submerged_road: { label: "Flooded road", icon: Waves, letter: "R" },
  structural: { label: "Structural damage", icon: Building2, letter: "B" },
  powerline: { label: "Downed powerline", icon: Zap, letter: "P" },
  stranded: { label: "Stranded people", icon: LifeBuoy, letter: "H" },
  other: { label: "Other hazard", icon: AlertTriangle, letter: "O" },
};

export const SEVERITY_META = {
  low: { label: "Low", tone: "cyan" },
  medium: { label: "Medium", tone: "indigo" },
  high: { label: "High", tone: "coral" },
  critical: { label: "Critical", tone: "coral" },
};

export const STATUS_META = {
  unverified: { label: "Unverified", tone: "indigo" },
  verified: { label: "Verified", tone: "cyan" },
  resolved: { label: "Resolved", tone: "indigo" },
};

// coral = high danger, cyan = verified, indigo = unverified, gray = resolved
export const pinHex = (r) =>
  r.status === "resolved"
    ? "#64748B"
    : ["high", "critical"].includes(r.ai?.severity) || ["stranded", "powerline"].includes(r.type)
      ? "#FF5A6E"
      : r.status === "verified"
        ? "#22D3EE"
        : "#6366F1";