import { ShieldCheck, HelpCircle, Siren } from "lucide-react";

export const STATUS_META = {
  safe: { label: "Safe", tone: "cyan", icon: ShieldCheck, hex: "#22D3EE", letter: "S" },
  unknown: { label: "Unknown", tone: "indigo", icon: HelpCircle, hex: "#6366F1", letter: "?" },
  sos: { label: "SOS", tone: "coral", icon: Siren, hex: "#FF5A6E", letter: "!" },
};