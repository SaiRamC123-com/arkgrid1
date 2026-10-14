import { Fragment } from "react";
import L from "leaflet";
import { MapContainer, Marker, Tooltip, Circle, CircleMarker, Polyline } from "react-leaflet";
import { DarkTiles, FitBounds, ClickPicker, youIcon } from "../map/MapKit";
import RiskLayer from "../map/RiskLayer";
import { TEAM_STATUS, TEAM_TYPES, INFRA_STATUS, INFRA_KINDS } from "./opsMeta";
import { SEV } from "../incidents/incidentMeta";
import { AVAIL_META } from "../shelters/shelterMeta";
import { ROAD_STATUS } from "../roads/roadMeta";

const pin = (hex, letter, extra = "", cls = "") =>
  L.divIcon({
    className: "",
    html: `<div class="ark-pin ${cls}" style="--c:${hex};${extra}"><span>${letter}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });

export default function OpsMap({ data, layers, risk, gps, picking, picked, onPick, fitPoints, fitKey }) {
  const located = (a) => a.filter((x) => x.location || x.centroid || (x.lat != null && x.lng != null));
  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[420px] w-full sm:h-[560px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />
      {picking && <ClickPicker onPick={onPick} />}

      {layers.risk && risk && <RiskLayer cells={risk.cells} cell={risk.cell} interactive={false} />}

      {layers.roads && data.roads.map((r) => (
        <Polyline key={r.id} positions={r.coords.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: ROAD_STATUS[r.status].hex, weight: 5, opacity: 0.85, dashArray: r.verified ? undefined : "8 8", lineCap: "round" }}>
          <Tooltip sticky>{r.name} · {ROAD_STATUS[r.status].label}</Tooltip>
        </Polyline>
      ))}

      {layers.shelters && data.shelters.items.map((s) => (
        <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={7}
          pathOptions={{ color: "#fff", weight: 1.5, fillColor: AVAIL_META[s.availability].hex, fillOpacity: 0.95 }}>
          <Tooltip direction="top">{s.name} · {AVAIL_META[s.availability].label}{s.capacity ? ` · ${s.occupied}/${s.capacity}` : ""}</Tooltip>
        </CircleMarker>
      ))}

      {layers.incidents && data.incidents.filter((i) => i.centroid).map((i) => {
        const hex = SEV[i.severity].hex;
        const c = [i.centroid.lat, i.centroid.lng];
        return (
          <Fragment key={i.id}>
            <Circle center={c} radius={Math.max(i.radiusM + 30, 45)} interactive={false}
              pathOptions={{ color: hex, fillColor: hex, fillOpacity: 0.14, weight: 2 }} />
            <Marker position={c} icon={pin(hex, i.signals)} zIndexOffset={500}>
              <Tooltip direction="top" offset={[0, -30]}>INC-{i.code} · {i.title}</Tooltip>
            </Marker>
          </Fragment>
        );
      })}

      {layers.infra && data.infra.map((x) => (
        <Marker key={x.id} position={[x.lat, x.lng]} icon={pin(INFRA_STATUS[x.status].hex, INFRA_KINDS[x.kind].letter, "border-radius:8px;transform:none;")} zIndexOffset={400}>
          <Tooltip direction="top" offset={[0, -20]}>{x.name} · {INFRA_STATUS[x.status].label}</Tooltip>
        </Marker>
      ))}

      {layers.teams && located(data.teams).filter((t) => t.location).map((t) => (
        <Marker key={t.id} position={[t.location.lat, t.location.lng]} zIndexOffset={600}
          icon={pin(TEAM_STATUS[t.status].hex, TEAM_TYPES[t.type].letter, t.stale ? "opacity:.45;" : "")}>
          <Tooltip direction="top" offset={[0, -30]}>{t.name} · {TEAM_STATUS[t.status].label}{t.assignedIncidentCode ? ` · INC-${t.assignedIncidentCode}` : ""}</Tooltip>
        </Marker>
      ))}

      {layers.sos && data.sos.filter((s) => s.location).map((s) => (
        <Marker key={s.id} position={[s.location.lat, s.location.lng]} icon={pin("#FF5A6E", "!", "", "sos")} zIndexOffset={900}>
          <Tooltip direction="top" offset={[0, -30]}>SOS · {s.name} · {s.peopleCount} {s.peopleCount > 1 ? "people" : "person"}</Tooltip>
        </Marker>
      ))}

      {picked && <CircleMarker center={[picked.lat, picked.lng]} radius={11} pathOptions={{ color: "#FF5A6E", fillColor: "#FF5A6E", fillOpacity: 0.5, weight: 3 }} />}
      {gps && (
        <Marker position={[gps.lat, gps.lng]} icon={youIcon} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -10]}>You are here</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}