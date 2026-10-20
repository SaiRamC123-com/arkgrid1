import { MapContainer, Marker, Tooltip, CircleMarker } from "react-leaflet";
import { DarkTiles, FitBounds, ClickPicker, youIcon } from "../map/Mapkit";
import RiskLayer from "../map/RiskLayer";

const alertColors = { Red: "#fb7185", Orange: "#fbbf24", Green: "#4ade80" };

export default function RiskMap({
  result,
  monitoring,
  activeLayer = "monitoring",
  selectedKey,
  onSelect,
  gps,
  center,
  picking,
  onPick,
  fitPoints,
  fitKey,
}) {
  const showMl = activeLayer === "ml" && result?.cells && result?.cell;
  const activeCells = showMl ? result.cells : (monitoring?.cells || result?.cells);
  const activeCell = showMl ? result.cell : (monitoring?.cell || result?.cell);

  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[360px] w-full sm:h-[500px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />
      {picking && <ClickPicker onPick={onPick} />}
      {activeCells && activeCell && (
        <RiskLayer
          cells={activeCells}
          cell={activeCell}
          selectedKey={selectedKey}
          onSelect={onSelect}
          interactive={!picking}
        />
      )}
      {monitoring?.weather.points.map((point) => (
        <CircleMarker key={point.id} center={[point.lat, point.lng]} radius={4}
          pathOptions={{ color: "#67e8f9", fillColor: "#0891b2", fillOpacity: 0.9, weight: 2 }}>
          <Tooltip direction="top">
            {point.forecast24Mm === null
              ? "Open-Meteo precipitation sample unavailable"
              : `Model-estimated next 24 h precipitation: ${point.forecast24Mm.toFixed(1)} mm`}
          </Tooltip>
        </CircleMarker>
      ))}
      {monitoring?.alerts.events.map((event) => (
        <CircleMarker key={event.id} center={[event.latitude, event.longitude]} radius={8}
          pathOptions={{
            color: alertColors[event.severity] || "#a78bfa",
            fillColor: alertColors[event.severity] || "#7c3aed",
            fillOpacity: 0.8,
            weight: 2,
          }}>
          <Tooltip direction="top">{event.title} · GDACS {event.severity || "severity unavailable"}</Tooltip>
        </CircleMarker>
      ))}
      {monitoring?.fieldReports.reports.map((report) => (
        <CircleMarker key={report.id} center={[report.lat, report.lng]} radius={7}
          pathOptions={{ color: "#fecaca", fillColor: "#dc2626", fillOpacity: 0.9, weight: 2 }}>
          <Tooltip direction="top">{report.title} · {report.source}</Tooltip>
        </CircleMarker>
      ))}
      {center && (
        <CircleMarker center={[center.lat, center.lng]} radius={7} interactive={false}
          pathOptions={{ color: "#fff", fillColor: "#070B1F", fillOpacity: 1, weight: 3 }} />
      )}
      {gps && (
        <Marker position={[gps.lat, gps.lng]} icon={youIcon} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -10]}>You are here</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}