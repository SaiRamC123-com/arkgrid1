import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";

function Recenter({ location }) {
  const map = useMap();
  useEffect(() => {
    map.setView([location.lat, location.lng], map.getZoom());
  }, [location.lat, location.lng, map]);
  return null;
}

export default function SOSLocationMap({ location }) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;

  return (
    <MapContainer
      center={[location.lat, location.lng]}
      zoom={15}
      className="h-56 w-full rounded-xl"
      scrollWheelZoom={false}
      dragging={false}
      zoomControl={false}
    >
      <Recenter location={location} />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      <CircleMarker
        center={[location.lat, location.lng]}
        radius={9}
        pathOptions={{ color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.9, weight: 3 }}
      />
    </MapContainer>
  );
}
