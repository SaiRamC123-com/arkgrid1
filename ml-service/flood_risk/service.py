from datetime import datetime, timezone

import numpy as np

from .model import TIERS, get_model, predict
from .terrain import build_grid, derive, get_elevation
from .weather import fetch_rain


def assess(lat, lng, radius_m, n, rain_24h, rain_1h, soil):
    LAT, LNG, dlat, dlng, cell_m = build_grid(lat, lng, radius_m, n)
    elev, elev_src = get_elevation(LAT, LNG)
    slope, relief, hal = derive(elev, cell_m)

    weather = None
    if rain_24h is not None:
        r24 = float(rain_24h)
        r1 = float(rain_1h) if rain_1h is not None else min(80.0, r24 * 0.25)
        r1 = min(r1, r24)
        rain_src = "manual scenario"
    else:
        try:
            weather = fetch_rain(lat, lng)
            r24, r1 = max(weather["past24_mm"], weather["next24_mm"]), weather["peak_hour_mm"]
            rain_src = "Open-Meteo forecast (past 24 h and next 24 h)"
        except Exception as e:  # noqa: BLE001
            print(f"[weather] failed: {e}")
            r24 = r1 = 0.0
            rain_src = "unavailable (assumed 0 mm)"

    N = elev.size
    X = np.column_stack([elev.ravel(), slope.ravel(), relief.ravel(), hal.ravel(), np.full(N, soil), np.full(N, r24), np.full(N, r1)])
    tier, score, p = predict(X)

    cells = []
    for k in range(N):
        i, j = divmod(k, n)
        cells.append(
            {
                "i": i, "j": j,
                "lat": round(float(LAT[i, j]), 6), "lng": round(float(LNG[i, j]), 6),
                "tier": int(tier[k]), "score": round(float(score[k]), 3),
                "p": [round(float(v), 3) for v in p[k]] if p is not None else None,
                "elev": round(float(elev[i, j]), 1), "slope": round(float(slope[i, j]), 1), "relief": round(float(relief[i, j]), 1),
            }
        )

    counts = np.bincount(tier, minlength=4)
    card = get_model()[1]
    return {
        "center": {"lat": lat, "lng": lng},
        "radius_m": radius_m,
        "grid": n,
        "cell": {"dLat": dlat, "dLng": dlng, "size_m": round(cell_m)},
        "bounds": {
            "south": float(LAT.min() - dlat / 2), "north": float(LAT.max() + dlat / 2),
            "west": float(LNG.min() - dlng / 2), "east": float(LNG.max() + dlng / 2),
        },
        "cells": cells,
        "summary": {
            "tiers": [int(c) for c in counts],
            "pct": [round(float(c) / N * 100, 1) for c in counts],
            "max_tier": int(tier.max()),
            "labels": TIERS,
        },
        "inputs": {"rain_24h_mm": round(r24, 1), "rain_1h_mm": round(r1, 1), "soil_perm": soil, "weather": weather},
        "sources": {"elevation": elev_src, "rain": rain_src, "soil": f"assumed {soil:.2f} (no soil map connected)"},
        "model": {
            "trained_on": card["trained_on"], "kind": card["kind"], "mode": card["mode"],
            "version": card["version"], "created_at": card["created_at"], "validated": False,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }