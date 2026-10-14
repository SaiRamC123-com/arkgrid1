"""Build a real-data training CSV from a GeoTIFF DEM and a flood-extent raster
(e.g. a Copernicus EMS delineation rasterized to 1 = flooded, 0 = dry).

  python -m flood_risk.build_dataset --dem dem.tif --flood extent.tif --rain24 140 --rain1 30 --soil 0.4 --out data/flood_samples.csv

Both rasters must be in EPSG:4326. Run once per flood event (rainfall differs) and concatenate the CSVs.
Features are built with the SAME grid, terrain and derive() code used at inference, so there is no train/serve skew.
"""
import argparse
import csv
import os

import numpy as np

from .model import FEATURES
from .terrain import build_grid, derive, get_elevation

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dem", required=True)
    ap.add_argument("--flood", required=True)
    ap.add_argument("--rain24", type=float, required=True, help="event rainfall, 24 h total (mm)")
    ap.add_argument("--rain1", type=float, required=True, help="event peak hourly rainfall (mm)")
    ap.add_argument("--soil", type=float, default=0.5)
    ap.add_argument("--windows", type=int, default=150)
    ap.add_argument("--radius", type=float, default=3000)
    ap.add_argument("--grid", type=int, default=14)
    ap.add_argument("--out", default="data/flood_samples.csv")
    a = ap.parse_args()

    os.environ["DEM_GEOTIFF"] = a.dem
    import rasterio

    rng = np.random.default_rng(1)
    rows = []
    with rasterio.open(a.flood) as fl:
        b = fl.bounds
        for _ in range(a.windows):
            lat, lng = rng.uniform(b.bottom, b.top), rng.uniform(b.left, b.right)
            LAT, LNG, _, _, cell_m = build_grid(lat, lng, a.radius, a.grid)
            if LAT.min() < b.bottom or LAT.max() > b.top or LNG.min() < b.left or LNG.max() > b.right:
                continue
            elev, src = get_elevation(LAT, LNG, remote=False)
            if not src.startswith("GeoTIFF"):
                continue
            slope, relief, hal = derive(elev, cell_m)
            flooded = (np.array([v[0] for v in fl.sample(zip(LNG.ravel(), LAT.ravel()))]) > 0).astype(int)
            for k in range(flooded.size):
                i, j = divmod(k, a.grid)
                rows.append([elev[i, j], slope[i, j], relief[i, j], hal[i, j], a.soil, a.rain24, a.rain1, flooded[k]])

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(FEATURES + ["flooded"])
        w.writerows(rows)
    print(f"Wrote {len(rows)} samples to {a.out}")