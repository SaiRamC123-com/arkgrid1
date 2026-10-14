"""What-if simulator.

RAIN : replays the Model 01 susceptibility model hour by hour under a scenario (accumulating rainfall).
SURGE: connected "bathtub" model. A cell floods when its elevation is below (reference level + rise)
       AND it is hydrologically connected to the source cell. This is a first-order screening model:
       no flow dynamics, defences, culverts, drainage or waves, and the 90 m DEM has a vertical error of
       several metres (larger than typical surges), so use it to COMPARE scenarios, not to read depths.
Trap analysis: a flooded cell is a flash-surge trap when floodwater reaches it before a person could
walk (straight line, at `walk_ms`) to ground that never floods. Straight-line times are optimistic.
"""
import math
from datetime import datetime, timezone

import numpy as np
from scipy import ndimage

from flood_risk.model import TIERS, get_model, predict
from flood_risk.terrain import build_grid, derive, get_elevation

STEP = 0.1  # metres between level steps


def _grid(lat, lng, radius_m, n):
    LAT, LNG, dlat, dlng, cell_m = build_grid(lat, lng, radius_m, n)
    elev, src = get_elevation(LAT, LNG)
    head = {
        "center": {"lat": lat, "lng": lng}, "radius_m": radius_m, "grid": n,
        "cell": {"dLat": dlat, "dLng": dlng, "size_m": round(cell_m)},
        "bounds": {"south": float(LAT.min() - dlat / 2), "north": float(LAT.max() + dlat / 2),
                   "west": float(LNG.min() - dlng / 2), "east": float(LNG.max() + dlng / 2)},
        "sources": {"elevation": src},
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    warn = []
    if src.startswith("synthetic"):
        warn.append("Real terrain could not be loaded, so this simulation uses made-up demo terrain and is meaningless.")
    return LAT, LNG, cell_m, elev, head, warn


def simulate_rain(lat, lng, radius_m, n, soil, intensity, hours, antecedent):
    LAT, LNG, cell_m, elev, head, warn = _grid(lat, lng, radius_m, n)
    slope, relief, hal = derive(elev, cell_m)
    N = elev.size
    first_hi = np.full(N, -1)
    first_sv = np.full(N, -1)
    frames = []
    for t in range(hours + 1):
        r24 = min(antecedent + intensity * t, 600.0)
        r1 = float(intensity) if t > 0 else 0.0
        X = np.column_stack([elev.ravel(), slope.ravel(), relief.ravel(), hal.ravel(),
                             np.full(N, soil), np.full(N, r24), np.full(N, r1)])
        tier, _, _ = predict(X)
        first_hi = np.where((first_hi < 0) & (tier >= 2), t, first_hi)
        first_sv = np.where((first_sv < 0) & (tier >= 3), t, first_sv)
        frames.append({"t": t, "rain_24h_mm": round(r24, 1), "tiers": [int(v) for v in tier],
                       "counts": [int(c) for c in np.bincount(tier, minlength=4)]})

    card = get_model()[1]
    warn.append(f"Rain mode shows relative susceptibility from the prototype model (trained on: {card['trained_on']}). It is not water depth and is not validated.")
    cells = []
    for k in range(N):
        i, j = divmod(k, n)
        cells.append({"i": i, "j": j, "lat": round(float(LAT[i, j]), 6), "lng": round(float(LNG[i, j]), 6),
                      "elev": round(float(elev[i, j]), 1),
                      "hi": int(first_hi[k]) if first_hi[k] >= 0 else None,
                      "sv": int(first_sv[k]) if first_sv[k] >= 0 else None})
    return {**head, "mode": "rain",
            "scenario": {"rain": {"intensity_mm_h": intensity, "hours": hours, "antecedent_mm": antecedent, "soil_perm": soil}},
            "frames": frames, "cells": cells,
            "summary": {"labels": TIERS, "final_counts": frames[-1]["counts"], "cells_reaching_high": int((first_hi >= 0).sum())},
            "model": {"trained_on": card["trained_on"], "kind": card["kind"], "validated": False},
            "warnings": warn}


def simulate_surge(lat, lng, radius_m, n, height, rise, src_lat, src_lng, walk):
    LAT, LNG, cell_m, elev, head, warn = _grid(lat, lng, radius_m, n)
    b = head["bounds"]
    if src_lat is not None and src_lng is not None:
        d = (LAT - src_lat) ** 2 + ((LNG - src_lng) * math.cos(math.radians(lat))) ** 2
        si, sj = np.unravel_index(int(np.argmin(d)), d.shape)
        assumed = False
        if not (b["south"] <= src_lat <= b["north"] and b["west"] <= src_lng <= b["east"]):
            warn.append("The chosen water source is outside the analysed area, so the nearest edge cell was used.")
    else:
        si, sj = np.unravel_index(int(np.argmin(elev)), elev.shape)
        assumed = True
        warn.append("No water source was chosen, so the lowest ground in the area is assumed to be the river or coast the surge comes from.")

    base = float(elev[si, sj])
    levels = np.linspace(0.0, height, max(1, int(round(height / STEP))) + 1)
    t_level = np.full(elev.shape, np.nan)
    for L in levels:
        lab, _ = ndimage.label(elev <= base + L + 1e-9)  # 4-connected
        reached = lab == lab[si, sj]
        t_level[reached & np.isnan(t_level)] = L

    flooded = ~np.isnan(t_level)
    t_min = np.where(flooded, t_level / rise * 60.0, np.nan)
    depth = np.where(flooded, np.maximum(0.0, base + height - elev), 0.0)
    egress = ndimage.distance_transform_edt(flooded) * cell_m if (~flooded).any() else np.full(elev.shape, radius_m * 2.0)
    walk_min = egress / walk / 60.0

    status = np.zeros(elev.shape, dtype=int)            # 0 stays dry
    status[flooded] = 1                                 # 1 floods later, a person can walk out in time
    status[flooded & (t_min > 0) & (walk_min >= t_min)] = 2  # 2 flash-surge trap
    status[flooded & (t_min <= 0)] = 3                  # 3 already under water at the reference level

    peak = height / rise * 60.0
    warn += [
        "The elevation data (Copernicus GLO-90) has a vertical error of several metres, larger than typical surge heights. Compare scenarios rather than trusting absolute depths.",
        f"Connected-bathtub model with about {round(cell_m)} m cells: no flow dynamics, defences, culverts, drainage or waves, and narrow channels may be missed.",
        "Walk-out times are straight-line and optimistic (no obstacles, slower walking in deep water or darkness).",
    ]
    if flooded.sum() <= 1:
        warn.append("Almost nothing floods at this height. The source cell may be isolated by the grid. Try a larger surge or a different source.")

    N = elev.size
    cells = []
    for k in range(N):
        i, j = divmod(k, n)
        cells.append({"i": i, "j": j, "lat": round(float(LAT[i, j]), 6), "lng": round(float(LNG[i, j]), 6),
                      "elev": round(float(elev[i, j]), 1),
                      "t": round(float(t_min[i, j]), 1) if flooded[i, j] else None,
                      "d": round(float(depth[i, j]), 2), "egress": round(float(egress[i, j])),
                      "status": int(status[i, j])})
    area = cell_m ** 2 / 1e6
    return {**head, "mode": "surge",
            "scenario": {"surge": {"height_m": height, "rise_m_per_h": rise, "peak_min": round(peak, 1), "walk_ms": walk}},
            "source": {"lat": round(float(LAT[si, sj]), 6), "lng": round(float(LNG[si, sj]), 6), "elev": round(base, 1), "assumed": assumed},
            "cells": cells,
            "summary": {"flooded_cells": int(flooded.sum()), "flooded_km2": round(float(flooded.sum()) * area, 2),
                        "flooded_pct": round(float(flooded.mean()) * 100, 1),
                        "trap_cells": int((status == 2).sum()), "trap_km2": round(float((status == 2).sum()) * area, 2)},
            "warnings": warn}