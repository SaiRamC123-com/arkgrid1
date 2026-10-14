import { LifeBuoy, HeartPulse, Ship, Plane, Truck, Zap, Droplets, RadioTower, Construction, Building2, Fuel } from "lucide-react";

export const TEAM_STATUS = {
  available: { label: "Available", tone: "cyan", hex: "#22D3EE" },
  dispatched: { label: "Dispatched", tone: "indigo", hex: "#6366F1" },
  en_route: { label: "En route", tone: "indigo", hex: "#6366F1" },
  on_scene: { label: "On scene", tone: "coral", hex: "#FF5A6E" },
  returning: { label: "Returning", tone: "indigo", hex: "#6366F1" },
  offline: { label: "Offline", tone: "coral", hex: "#64748B" },
};

export const TEAM_TYPES = {
  rescue: { label: "Rescue", icon: LifeBuoy, letter: "R" },
  medical: { label: "Medical", icon: HeartPulse, letter: "M" },
  boat: { label: "Boat", icon: Ship, letter: "B" },
  drone: { label: "Drone", icon: Plane, letter: "D" },
  logistics: { label: "Logistics", icon: Truck, letter: "L" },
};

export const INFRA_STATUS = {
  operational: { label: "Operational", tone: "cyan", hex: "#22D3EE" },
  degraded: { label: "Degraded", tone: "indigo", hex: "#6366F1" },
  down: { label: "Down", tone: "coral", hex: "#FF5A6E" },
};

export const INFRA_KINDS = {
  power: { label: "Power", icon: Zap, letter: "P" },
  water: { label: "Water", icon: Droplets, letter: "W" },
  telecom: { label: "Telecom", icon: RadioTower, letter: "T" },
  bridge: { label: "Bridge", icon: Construction, letter: "B" },
  hospital_power: { label: "Hospital power", icon: Building2, letter: "H" },
  fuel: { label: "Fuel", icon: Fuel, letter: "F" },
};