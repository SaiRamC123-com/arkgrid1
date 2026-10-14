import { Fragment } from "react";
import { MapContainer, Polyline, CircleMarker, Marker, Tooltip } from "react-leaflet";
import { DarkTiles, FitBounds, ClickPicker, youIcon } from "../map/MapKit";
import { ROAD_STATUS } from "./roadMeta";

const ll = (coords) => coords.map((p) => [p.lat, p.lng]);

export default function RoadLayerMap({ roads, selectedId, onSelect, userPos, draft, draftHex, drawing, onAddPoint, fitPoints, fitKey }) {
  return (
    <MapContainer center={[20.59, 78.96]} zoom={5} className="h-[340px] w-full sm:h-[460px]" scrollWheelZoom>
      <DarkTiles />
      <FitBounds points={fitPoints} fitKey={fitKey} />
      {drawing && <ClickPicker onPick={onAddPoint} />}

      {roads.map((r) => {
        const m = ROAD_STATUS[r.status];
        const sel = r.id === selectedId;
        const line = ll(r.coords);
        return (
          <Fragment key={r.id}>
            <Polyline positions={line} interactive={false} pathOptions={{ color: m.hex, weight: 14, opacity: r.stale ? 0.08 : 0.22 }} />
            <Polyline
              positions={line}
              pathOptions={{ color: m.hex, weight: sel ? 9 : 6, opacity: r.stale ? 0.35 : 0.95, dashArray: r.verified ? undefined : "10 10", lineCap: "round" }}
              eventHandlers={{ click: () => !drawing && onSelect(r.id) }}
            >
              <Tooltip sticky>{r.name} · {m.label}{r.stale ? " · outdated" : ""}</Tooltip>
            </Polyline>
          </Fragment>
        );
      })}

      {draft.length > 1 && <Polyline positions={ll(draft)} pathOptions={{ color: draftHex, weight: 6, dashArray: "2 10", lineCap: "round" }} />}
      {draft.map((p, i) => (
        <CircleMarker key={i} center={[p.lat, p.lng]} radius={6} pathOptions={{ color: "#fff", fillColor: draftHex, fillOpacity: 1, weight: 2 }} />
      ))}

      {userPos && (
        <Marker position={[userPos.lat, userPos.lng]} icon={youIcon} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -10]}>You are here</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}