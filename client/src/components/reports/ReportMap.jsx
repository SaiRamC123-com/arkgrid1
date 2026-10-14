import L from "leaflet";
import { MapContainer, Marker, Tooltip, CircleMarker } from "react-leaflet";
import { DarkTiles, FitBounds, ClickPicker, youIcon } from "../map/MapKit";
import { REPORT_TYPES, pinHex } from "./reportMeta";

const pin = (r, selected) =>
  L.divIcon({
    className: "",
    html: `<div class="ark-pin" style="--c:${pinHex(r)};${r.status === "unverified" ? "border-style:dashed;" : ""}${
      selected ? "transform:rotate(-45deg) scale(1.35);" : ""
    }"><span>${REPORT_TYPES[r.type].letter}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });

export default function ReportMap({ reports, selectedId, onSelect, userPos, picking, picked, onPick, fitPoints, fitKey }) {
  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[340px] w-full sm:h-[440px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />
      {picking && <ClickPicker onPick={onPick} />}

      {reports.map((r) => (
        <Marker key={r.id} position={[r.lat, r.lng]} icon={pin(r, r.id === selectedId)} eventHandlers={{ click: () => onSelect(r.id) }}>
          <Tooltip direction="top" offset={[0, -30]}>{REPORT_TYPES[r.type].label}</Tooltip>
        </Marker>
      ))}

      {userPos && (
        <Marker position={[userPos.lat, userPos.lng]} icon={youIcon} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -10]}>You are here</Tooltip>
        </Marker>
      )}
      {picked && (
        <CircleMarker center={[picked.lat, picked.lng]} radius={11} pathOptions={{ color: "#FF5A6E", fillColor: "#FF5A6E", fillOpacity: 0.5, weight: 3 }} />
      )}
    </MapContainer>
  );
}