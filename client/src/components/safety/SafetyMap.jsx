import L from "leaflet";
import { MapContainer, Marker, Tooltip, Polyline, CircleMarker, Circle } from "react-leaflet";
import { DarkTiles, FitBounds, ClickPicker, youIcon } from "../map/MapKit";
import SimLayer from "../sim/SimLayer";
import { TEAM_STATUS, TEAM_TYPES } from "../ops/opsMeta";
import { ROAD_STATUS } from "../roads/roadMeta";

const pin = (hex, letter, extra = "") => L.divIcon({ className: "", html: `<div class="ark-pin" style="--c:${hex};${extra}"><span>${letter}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34] });
const dot = (txt, hex) => L.divIcon({ className: "", html: `<div style="width:26px;height:26px;border-radius:50%;background:${hex};border:2px solid #fff;color:#070B1F;font:700 13px Space Grotesk,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px ${hex}">${txt}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

// 0 dry (not drawn) · 1 floods later · 2 trap · 3 already wet
const CELL = { 1: { hex: "#6366F1", op: 0.2 }, 2: { hex: "#FF5A6E", op: 0.62, edge: "#fff", weight: 1.2 }, 3: { hex: "#6366F1", op: 0.55 } };

export default function SafetyMap({ sim, teams, powerlines, roads, targets, routes, drone, launch, staging, gps, picking, onPick, fitPoints, fitKey }) {
  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[420px] w-full sm:h-[560px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />
      {picking && <ClickPicker onPick={onPick} />}

      {sim && <SimLayer cells={sim.cells} cell={sim.cell} interactive={!picking} styleOf={(c) => CELL[c.status] || null} />}

      {roads.filter((r) => r.status !== "passable" && !r.stale).map((r) => (
        <Polyline key={r.id} positions={r.coords.map((p) => [p.lat, p.lng])} interactive={false} pathOptions={{ color: ROAD_STATUS[r.status].hex, weight: 4, opacity: 0.7, dashArray: "6 8" }} />
      ))}
      {powerlines.map((p) => (
        <Circle key={p.id} center={[p.lat, p.lng]} radius={100} interactive={false} pathOptions={{ color: "#FF5A6E", weight: 1.5, dashArray: "4 6", fillOpacity: 0.08 }}>
          <Tooltip direction="top">Reported downed powerline · 100 m keep-clear</Tooltip>
        </Circle>
      ))}

      {routes.map((r, i) => <Polyline key={i} positions={r.coords} pathOptions={{ color: r.color, weight: 5, opacity: 0.95 }} />)}
      {drone && <Polyline positions={[[launch.lat, launch.lng], ...drone.order.map((p) => [p.lat, p.lng]), [launch.lat, launch.lng]]} pathOptions={{ color: "#fff", weight: 3, dashArray: "2 8" }} />}
      {drone && drone.order.map((p, i) => <Marker key={p.id} position={[p.lat, p.lng]} icon={dot(i + 1, "#22D3EE")} zIndexOffset={600}><Tooltip direction="top">{i + 1}. {p.label}</Tooltip></Marker>)}
      {launch && <Marker position={[launch.lat, launch.lng]} icon={dot("L", "#fff")} zIndexOffset={700}><Tooltip direction="top">Launch / staging</Tooltip></Marker>}
      {staging && <Marker position={[staging.lat, staging.lng]} icon={dot("S", "#22D3EE")} zIndexOffset={700}><Tooltip direction="top">Mission staging point</Tooltip></Marker>}

      {targets.map((t) => <CircleMarker key={t.id} center={[t.lat, t.lng]} radius={6} pathOptions={{ color: "#fff", weight: 1.5, fillColor: t.kind === "sos" ? "#FF5A6E" : "#6366F1", fillOpacity: 0.95 }}><Tooltip direction="top">{t.label}</Tooltip></CircleMarker>)}
      {teams.filter((t) => t.location).map((t) => (
        <Marker key={t.id} position={[t.location.lat, t.location.lng]} zIndexOffset={800} icon={pin(TEAM_STATUS[t.status].hex, TEAM_TYPES[t.type].letter, t.stale ? "opacity:.45;" : "")}>
          <Tooltip direction="top" offset={[0, -30]}>{t.name} · {TEAM_STATUS[t.status].label}</Tooltip>
        </Marker>
      ))}
      {gps && <Marker position={[gps.lat, gps.lng]} icon={youIcon} zIndexOffset={1000}><Tooltip direction="top" offset={[0, -10]}>You are here</Tooltip></Marker>}
    </MapContainer>
  );
}