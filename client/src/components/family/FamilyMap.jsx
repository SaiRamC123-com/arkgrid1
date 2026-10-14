import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { STATUS_META } from "./statusMeta";

const pin = (status) => {
  const m = STATUS_META[status] || STATUS_META.unknown;
  return L.divIcon({
    className: "",
    html: `<div class="ark-pin ${status === "sos" ? "sos" : ""}" style="--c:${m.hex}"><span>${m.letter}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
};

function FitBounds({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [50, 50], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

function ClickPicker({ onPick }) {
  useMapEvents({ click: (e) => onPick && onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function FamilyMap({ members, zones, myUid, picked, pickRadius, onPick, canPick, fitKey }) {
  const located = members.filter((m) => m.lastLocation);
  const points = [
    ...located.map((m) => [m.lastLocation.lat, m.lastLocation.lng]),
    ...zones.map((z) => [z.lat, z.lng]),
  ];

  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[360px] w-full sm:h-[440px]" scrollWheelZoom>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      <FitBounds points={points} fitKey={fitKey} />
      {canPick && <ClickPicker onPick={onPick} />}

      {zones.map((z) => (
        <Circle
          key={z.id}
          center={[z.lat, z.lng]}
          radius={z.radius}
          pathOptions={{ color: "#22D3EE", fillColor: "#22D3EE", fillOpacity: 0.12, weight: 2, dashArray: "6 6" }}
        >
          <Tooltip sticky>{z.name} · {z.radius} m</Tooltip>
        </Circle>
      ))}

      {picked && (
        <Circle
          center={[picked.lat, picked.lng]}
          radius={pickRadius}
          pathOptions={{ color: "#FF5A6E", fillColor: "#FF5A6E", fillOpacity: 0.15, weight: 2 }}
        />
      )}

      {located.map((m) => (
        <Marker key={m.uid} position={[m.lastLocation.lat, m.lastLocation.lng]} icon={pin(m.status)}>
          <Tooltip direction="top" offset={[0, -30]}>
            {m.name}{m.uid === myUid ? " (You)" : ""}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}