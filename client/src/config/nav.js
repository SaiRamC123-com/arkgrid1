import {
  Home, Users, Radio, Building2, Camera, Route,
  LayoutDashboard, Target, ListOrdered, SlidersHorizontal, Package, ShieldAlert,
  Layers, CloudRain,
} from "lucide-react";

export const citizenNav = [
  { path: "/citizen", label: "Home", icon: Home, end: true },
  { path: "/citizen/family", label: "Family Network", icon: Users },
  { path: "/citizen/sos", label: "One-Tap SOS", icon: Radio },
  { path: "/citizen/shelters", label: "Shelters & Hospitals", icon: Building2 },
  { path: "/citizen/reports", label: "Crowd Reports", icon: Camera },
  { path: "/citizen/roads", label: "Road Accessibility", icon: Route },
  { path: "/citizen/risk", label: "Flood Risk", icon: CloudRain },
];

export const commandNav = [
  { path: "/command", label: "Command Dashboard", icon: LayoutDashboard, end: true },
  { path: "/command/incidents", label: "Incident Clusters", icon: Layers },
  { path: "/command/search-zones", label: "Search Zones", icon: Target },
  { path: "/command/priority", label: "Rescue Priority", icon: ListOrdered },
  { path: "/command/simulator", label: "What-If Simulator", icon: SlidersHorizontal },
  { path: "/command/logistics", label: "Relief Logistics", icon: Package },
  { path: "/command/drone-safety", label: "Drone & Responder Safety", icon: ShieldAlert },
  { path: "/command/shelters", label: "Shelters & Hospitals", icon: Building2 },
  { path: "/command/reports", label: "Crowd Reports", icon: Camera },
  { path: "/command/roads", label: "Road Accessibility", icon: Route },
  { path: "/command/risk", label: "Flood Risk", icon: CloudRain },
];