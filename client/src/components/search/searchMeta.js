import { Waves, Footprints, Home } from "lucide-react";

export const SITUATIONS = {
  water_borne: { label: "Swept by water", icon: Waves, hint: "Carried by the current. Strong downhill drift." },
  on_foot: { label: "On foot, moving", icon: Footprints, hint: "Walking. Wide spread, weak drift." },
  stranded: { label: "Stranded in place", icon: Home, hint: "Cannot move. Tight zone around the last location." },
};

export const COMPASS = [["", "Use terrain only"], ["0", "N (0°)"], ["45", "NE (45°)"], ["90", "E (90°)"], ["135", "SE (135°)"], ["180", "S (180°)"], ["225", "SW (225°)"], ["270", "W (270°)"], ["315", "NW (315°)"]];
export const SPEEDS = [["", "Assume 0.5 m/s"], ["slow", "Slow (~0.2 m/s)"], ["moderate", "Moderate (~0.6 m/s)"], ["fast", "Fast (~1.5 m/s)"]];

// 50 % zone is the smallest and most likely area
export const ZONE_STYLE = {
  0.5: { label: "50%", hex: "#FF5A6E", fill: 0.3 },
  0.75: { label: "75%", hex: "#6366F1", fill: 0.2 },
  0.9: { label: "90%", hex: "#22D3EE", fill: 0.12 },
};

export const fmtElapsed = (iso, now = Date.now()) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};