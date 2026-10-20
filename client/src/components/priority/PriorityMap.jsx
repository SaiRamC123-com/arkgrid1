import L from "leaflet";
import { MapContainer, Marker, Tooltip, Circle } from "react-leaflet";
import { DarkTiles, FitBounds, youIcon } from "../map/Mapkit";
import { bandOf } from "../../utils/mcda";

const pin = (rank, hex, selected) =>
  L.divIcon({
    className: "",
    html: `<div class="ark-pin" style="--c:${hex};${selected ? "transform:rotate(-45deg) scale(1.35);" : ""}"><span>${rank}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });

export default function PriorityMap({ items, selectedId, onSelect, gps, fitPoints, fitKey }) {
  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[320px] w-full sm:h-[420px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />
      {items.filter((i) => i.centroid).map((i) => {
        const hex = bandOf(i.score).hex;
        return (
          <div key={i.id}>
            <Circle center={[i.centroid.lat, i.centroid.lng]} radius={90} interactive={false}
              pathOptions={{ color: hex, fillColor: hex, fillOpacity: 0.15, weight: 1.5 }} />
            <Marker position={[i.centroid.lat, i.centroid.lng]} icon={pin(i.rank, hex, i.id === selectedId)} eventHandlers={{ click: () => onSelect(i.id) }}>
              <Tooltip direction="top" offset={[0, -30]}>#{i.rank} · INC-{i.code} · score {Math.round(i.score)}</Tooltip>
            </Marker>
          </div>
        );
      })}
      {gps && (
        <Marker position={[gps.lat, gps.lng]} icon={youIcon} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -10]}>You are here</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}