import {
  Home, Users, Radio, Camera, Route,
  LayoutDashboard, Target, ListOrdered, SlidersHorizontal, Package, ShieldAlert,
  Layers, CloudRain, Activity, Thermometer, History,
} from "lucide-react";

export const citizenNav = [
  { path: "/citizen", label: "Home", icon: Home, end: true },
  { path: "/citizen/family", label: "Family Network", icon: Users },
  { path: "/citizen/sos", label: "One-Tap SOS", icon: Radio },
  { path: "/citizen/reports", label: "Crowd Reports", icon: Camera },
  { path: "/citizen/roads", label: "Road Accessibility", icon: Route },
  { path: "/citizen/risk", label: "Flood Risk", icon: CloudRain },
  { path: "/citizen/observations", label: "Live Observations", icon: Activity },
  { path: "/citizen/heat-wave", label: "Heat Wave Tracking", icon: Thermometer },
  { path: "/citizen/disaster-history", label: "Disaster History & Incident Clusters", icon: History },
];

export const commandNav = [
  { path: "/command", label: "Command Dashboard", icon: LayoutDashboard, end: true },
  { path: "/command/incidents", label: "Incident Clusters", icon: Layers },
  { path: "/command/search-zones", label: "Search Zones", icon: Target },
  { path: "/command/priority", label: "Rescue Priority", icon: ListOrdered },
  { path: "/command/simulator", label: "What-If Simulator", icon: SlidersHorizontal },
  { path: "/command/logistics", label: "Relief Logistics", icon: Package },
  { path: "/command/drone-safety", label: "Drone & Responder Safety", icon: ShieldAlert },
  { path: "/command/reports", label: "Crowd Reports", icon: Camera },
  { path: "/command/roads", label: "Road Accessibility", icon: Route },
  { path: "/command/risk", label: "Flood Risk", icon: CloudRain },
  { path: "/command/observations", label: "Live Observations", icon: Activity },
  { path: "/command/heat-wave", label: "Heat Wave Tracking", icon: Thermometer },
];

export const publicCitizenNav = [
  { path: "/citizen", label: "Home", icon: Home, end: true },
  { path: "/citizen/observations", label: "Live Observations", icon: Activity },
  { path: "/citizen/heat-wave", label: "Heat Wave Tracking", icon: Thermometer },
  { path: "/citizen/disaster-history", label: "Disaster History & Incident Clusters", icon: History },
];