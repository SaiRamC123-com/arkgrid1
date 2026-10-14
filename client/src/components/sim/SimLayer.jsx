import { Rectangle } from "react-leaflet";

export default function SimLayer({ cells, cell, styleOf, onPick, interactive = true }) {
  const hLat = cell.dLat / 2;
  const hLng = cell.dLng / 2;
  return cells.map((c, k) => {
    const s = styleOf(c, k);
    if (!s) return null;
    return (
      <Rectangle key={k} bounds={[[c.lat - hLat, c.lng - hLng], [c.lat + hLat, c.lng + hLng]]} interactive={interactive}
        pathOptions={{ color: s.edge || s.hex, weight: s.weight ?? 0.4, opacity: 0.55, fillColor: s.hex, fillOpacity: s.op }}
        eventHandlers={{ click: () => onPick?.(c, k) }} />
    );
  });
}