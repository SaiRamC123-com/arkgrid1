import L from "leaflet";
import { MapContainer, Circle, Marker, Tooltip } from "react-leaflet";
import { DarkTiles, FitBounds, youIcon } from "../map/Mapkit";
import { SEV } from "./incidentMeta";

const pin = (i, selected) =>
  L.divIcon({
    className: "",
    html: `<div class="ark-pin ${i.counts.sos ? "sos" : ""}" style="--c:${SEV[i.severity].hex};${selected ? "transform:rotate(-45deg) scale(1.35);" : ""}"><span>${i.signals}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });

export default function IncidentMap({ incidents, selectedId, onSelect, userPos, fitPoints, fitKey }) {
  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[340px] w-full sm:h-[460px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />

      {incidents.filter((i) => i.centroid).map((i) => {
        const c = [i.centroid.lat, i.centroid.lng];
        const hex = SEV[i.severity].hex;
        return (
          <div key={i.id}>
            <Circle center={c} radius={Math.max(i.radiusM + 30, 45)}
              pathOptions={{ color: hex, fillColor: hex, fillOpacity: i.id === selectedId ? 0.28 : 0.14, weight: 2 }} />
            <Marker position={c} icon={pin(i, i.id === selectedId)} eventHandlers={{ click: () => onSelect(i.id) }}>
              <Tooltip direction="top" offset={[0, -30]}>INC-{i.code} · {i.title}</Tooltip>
            </Marker>
          </div>
        );
      })}

      {userPos && (
        <Marker position={[userPos.lat, userPos.lng]} icon={youIcon} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -10]}>You are here</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}