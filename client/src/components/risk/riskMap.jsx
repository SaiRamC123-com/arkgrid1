import { MapContainer, Marker, Tooltip, CircleMarker } from "react-leaflet";
import { DarkTiles, FitBounds, ClickPicker, youIcon } from "../map/MapKit";
import RiskLayer from "../map/RiskLayer";

export default function RiskMap({ result, selectedKey, onSelect, gps, center, picking, onPick, fitPoints, fitKey }) {
  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[360px] w-full sm:h-[500px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />
      {picking && <ClickPicker onPick={onPick} />}
      {result && <RiskLayer cells={result.cells} cell={result.cell} selectedKey={selectedKey} onSelect={onSelect} interactive={!picking} />}
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