import L from "leaflet";
import { MapContainer, Marker, Polyline, Tooltip, CircleMarker } from "react-leaflet";
import { DarkTiles, FitBounds, ClickPicker, youIcon } from "../map/MapKit";
import { TYPE_META, AVAIL_META } from "./shelterMeta";

const pin = (s, selected) => {
  const hex = AVAIL_META[s.availability].hex;
  const extra = selected ? "transform:rotate(-45deg) scale(1.35);z-index:999;" : "";
  return L.divIcon({
    className: "",
    html: `<div class="ark-pin" style="--c:${hex};${extra}"><span>${TYPE_META[s.type].letter}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
};

export default function ShelterMap({
  shelters, selectedId, onSelect, userPos, routeCoords, routeApprox,
  picking, picked, onPick, fitPoints, fitKey,
}) {
  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[340px] w-full sm:h-[460px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />
      {picking && <ClickPicker onPick={onPick} />}

      {routeCoords && (
        <>
          <Polyline positions={routeCoords} pathOptions={{ color: "#22D3EE", weight: 12, opacity: 0.18 }} />
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: "#22D3EE", weight: 5, opacity: 0.95, dashArray: routeApprox ? "8 10" : undefined }}
          />
        </>
      )}

      {shelters.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          icon={pin(s, s.id === selectedId)}
          eventHandlers={{ click: () => onSelect(s.id) }}
        >
          <Tooltip direction="top" offset={[0, -30]}>{s.name}</Tooltip>
        </Marker>
      ))}

      {userPos && (
        <Marker position={[userPos.lat, userPos.lng]} icon={youIcon} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -10]}>You are here</Tooltip>
        </Marker>
      )}

      {picked && (
        <CircleMarker
          center={[picked.lat, picked.lng]}
          radius={11}
          pathOptions={{ color: "#FF5A6E", fillColor: "#FF5A6E", fillOpacity: 0.5, weight: 3 }}
        />
      )}
    </MapContainer>
  );
}