import { memo } from "react";
import { Rectangle } from "react-leaflet";
import { TIERS } from "../risk/riskMeta";

// Drop-in layer: <RiskLayer cells={...} cell={...} /> inside any react-leaflet map
function RiskLayer({ cells, cell, selectedKey, onSelect, interactive = true }) {
  const hLat = cell.dLat / 2;
  const hLng = cell.dLng / 2;
  return cells.map((c) => {
    const t = TIERS[c.tier];
    const sel = selectedKey === `${c.i}-${c.j}`;
    return (
      <Rectangle
        key={`${c.i}-${c.j}`}
        bounds={[[c.lat - hLat, c.lng - hLng], [c.lat + hLat, c.lng + hLng]]}
        interactive={interactive}
        pathOptions={{
          color: sel ? "#ffffff" : t.hex,
          weight: sel ? 2.5 : 0.4,
          opacity: sel ? 1 : 0.5,
          fillColor: t.hex,
          fillOpacity: sel ? Math.min(0.85, t.fill * 1.5) : t.fill,
        }}
        eventHandlers={{ click: () => onSelect?.(c) }}
      />
    );
  });
}

export default memo(RiskLayer);