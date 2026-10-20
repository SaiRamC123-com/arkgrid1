import { memo } from "react";
import { Rectangle } from "react-leaflet";
import { TIERS } from "../risk/riskMeta";

// Drop-in layer: <RiskLayer cells={...} cell={...} /> inside any react-leaflet map
function RiskLayer({ cells, cell, selectedKey, onSelect, interactive = true }) {
  if (!cells || !cell || !cells.length) return null;
  const hLat = cell.dLat / 2;
  const hLng = cell.dLng / 2;
  return cells.map((c) => {
    const t = c.tier !== undefined ? TIERS[c.tier] : null;
    const color = c.color || t?.hex || "#94a3b8";
    const fill = c.fillOpacity ?? t?.fill ?? 0.25;
    const sel = selectedKey === `${c.i}-${c.j}`;
    return (
      <Rectangle
        key={`${c.i}-${c.j}`}
        bounds={[[c.lat - hLat, c.lng - hLng], [c.lat + hLat, c.lng + hLng]]}
        interactive={interactive}
        pathOptions={{
          color: sel ? "#ffffff" : color,
          weight: sel ? 2.5 : 0.4,
          opacity: sel ? 1 : 0.6,
          fillColor: color,
          fillOpacity: sel ? Math.min(0.85, fill * 1.5) : fill,
        }}
        eventHandlers={{ click: () => onSelect?.(c) }}
      />
    );
  });
}

export default memo(RiskLayer);