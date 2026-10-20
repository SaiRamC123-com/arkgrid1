import { useCallback, useEffect, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { DarkTiles, FitBounds, youIcon } from "../map/Mapkit";
import { HAZARD_COLORS, visualClusters } from "../../data/disasterHistory";

const makeIcon = (records) => {
  const colors = [...new Set(records.map((record) => record.demo ? HAZARD_COLORS.demo : HAZARD_COLORS[record.hazardType]))];
  const background = colors.length === 1
    ? colors[0]
    : `linear-gradient(135deg, ${colors.join(", ")})`;
  const count = records.length;
  const size = count > 1 ? 38 : 32;
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border:2px solid white;border-radius:50%;background:${background};color:white;font:700 11px sans-serif;box-shadow:0 1px 5px #334155">${count > 1 ? count : ""}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

function MapControls({ onChooseOrigin, onViewChange }) {
  useMapEvents({
    click(event) {
      onChooseOrigin({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
    moveend: onViewChange,
    zoomend: onViewChange,
  });
  return null;
}

function FocusRoute({ origin, route }) {
  const map = useMap();
  const originLat = origin?.lat;
  const originLng = origin?.lng;
  useEffect(() => {
    if (route?.coords?.length > 1) {
      map.fitBounds(route.coords, { padding: [40, 40], maxZoom: 14 });
    } else if (originLat != null && originLng != null) {
      map.flyTo([originLat, originLng], Math.max(map.getZoom(), 12), { duration: 0.4 });
    }
  }, [map, originLat, originLng, route]);
  return null;
}

function IncidentLayers({ incidents, onSelect }) {
  const map = useMap();
  const groups = visualClusters(incidents, (lat, lng) => {
    const point = map.latLngToLayerPoint([lat, lng]);
    return { x: point.x, y: point.y };
  });

  return groups.map((records) => {
    const lat = records.reduce((sum, record) => sum + record.latitude, 0) / records.length;
    const lng = records.reduce((sum, record) => sum + record.longitude, 0) / records.length;
    const label = records.length > 1
      ? `${records.length} records: ${[...new Set(records.map((record) => record.hazardType))].join(", ")}`
      : `${records[0].status}: ${records[0].title}`;
    return (
      <Marker
        key={records.map((record) => record.id).join(":")}
        position={[lat, lng]}
        icon={makeIcon(records)}
        title={label}
        keyboard
        eventHandlers={{ click: () => onSelect(records) }}
      >
        <Tooltip>{label}</Tooltip>
      </Marker>
    );
  });
}

export default function DisasterHistoryMap({
  incidents,
  onSelect,
  origin,
  destinations,
  selectedDestinationId,
  onSelectDestination,
  route,
  onChooseOrigin,
}) {
  const [, setViewRevision] = useState(0);
  const onViewChange = useCallback(() => setViewRevision((revision) => revision + 1), []);
  const fitPoints = incidents.map((record) => [record.latitude, record.longitude]);
  const fitKey = incidents.map((record) => record.id).join(",");

  return (
    <MapContainer center={[27, 92]} zoom={4} className="h-[380px] w-full sm:h-[520px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />
      <FocusRoute origin={origin} route={route} />
      <MapControls onChooseOrigin={onChooseOrigin} onViewChange={onViewChange} />
      <IncidentLayers incidents={incidents} onSelect={onSelect} />

      {route?.coords?.length > 1 && (
        <Polyline
          positions={route.coords}
          pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.9 }}
        />
      )}
      {origin && (
        <Marker position={[origin.lat, origin.lng]} icon={youIcon} zIndexOffset={1000} title="Selected route origin">
          <Tooltip>Selected origin · route condition is not guaranteed</Tooltip>
        </Marker>
      )}
      {destinations.map((candidate) => (
        <CircleMarker
          key={candidate.id}
          center={[candidate.lat, candidate.lng]}
          radius={selectedDestinationId === candidate.id ? 10 : 7}
          pathOptions={{
            color: candidate.verifiedHazards?.length ? "#dc2626" : "#1d4ed8",
            fillColor: candidate.verifiedHazards?.length ? "#dc2626" : "#3b82f6",
            fillOpacity: 0.8,
            weight: 2,
          }}
          eventHandlers={{ click: () => onSelectDestination(candidate.id) }}
        >
          <Tooltip>{candidate.name} · availability {candidate.reportedAvailability}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
