import L from "leaflet";
import { MapContainer, Polygon, Marker, Tooltip, Polyline, CircleMarker } from "react-leaflet";
import { DarkTiles, FitBounds, ClickPicker, youIcon } from "../map/MapKit";
import { ZONE_STYLE } from "./searchMeta";

const lklIcon = (active) =>
  L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:#070B1F;border:4px solid ${active ? "#fff" : "#94a3b8"};box-shadow:0 0 0 6px rgba(255,255,255,.18),0 0 18px #fff;"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

const peakIcon = L.divIcon({
  className: "",
  html: `<div class="ark-pin sos" style="--c:#FF5A6E"><span>★</span></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
});

export default function ZoneMap({ cases, selectedId, onSelect, zone, gps, picking, picked, onPick, fitPoints, fitKey }) {
  const sel = cases.find((c) => c.id === selectedId);
  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[360px] w-full sm:h-[520px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />
      {picking && <ClickPicker onPick={onPick} />}

      {zone && [...zone.zones].reverse().map((z) =>
        z.rings.map((ring, i) => (
          <Polygon key={`${z.p}-${i}`} positions={ring} interactive={false}
            pathOptions={{ color: ZONE_STYLE[z.p].hex, weight: 2, fillColor: ZONE_STYLE[z.p].hex, fillOpacity: ZONE_STYLE[z.p].fill }} />
        ))
      )}
      {zone && <Polyline positions={[[zone.lkl.lat, zone.lkl.lng], [zone.centroid.lat, zone.centroid.lng]]} interactive={false} pathOptions={{ color: "#fff", weight: 2, dashArray: "4 8", opacity: 0.8 }} />}
      {zone && (
        <Marker position={[zone.peak.lat, zone.peak.lng]} icon={peakIcon} zIndexOffset={800}>
          <Tooltip direction="top" offset={[0, -30]}>Most likely area (model peak)</Tooltip>
        </Marker>
      )}

      {cases.filter((c) => c.status === "active").map((c) => (
        <Marker key={c.id} position={[c.lat, c.lng]} icon={lklIcon(c.id === selectedId)} zIndexOffset={700} eventHandlers={{ click: () => !picking && onSelect(c.id) }}>
          <Tooltip direction="top" offset={[0, -12]}>{c.name} · last known location</Tooltip>
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