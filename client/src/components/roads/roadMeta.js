import { CheckCircle2, Waves, Ban } from "lucide-react";

export const ROAD_STATUS = {
  passable: { label: "Passable", tone: "cyan", hex: "#22D3EE", icon: CheckCircle2 },
  flooded: { label: "Flooded", tone: "indigo", hex: "#6366F1", icon: Waves },
  blocked: { label: "Blocked", tone: "coral", hex: "#FF5A6E", icon: Ban },
};