"""Terrain inputs: DEM sampling and derived features.

Elevation source order: local GeoTIFF -> Open-Meteo (Copernicus GLO-90) -> synthetic (demo only).
The same code builds training features and live features, so they never drift apart.
"""
import math
import os

import httpx
import numpy as np

M_LAT = 110540.0
M_LNG = 111320.0
ELEV_URL = "https://api.open-meteo.com/v1/elevation"
_cache: dict = {}


def build_grid(lat, lng, radius_m, n):
    """n x n cell centers over a square of side 2*radius_m. Axis 0 = latitude (south to north)."""
    cell_m = 2.0 * radius_m / n
    dlat = cell_m / M_LAT
    dlng = cell_m / (M_LNG * math.cos(math.radians(lat)))
    lats = lat + (np.arange(n) - (n - 1) / 2) * dlat
    lngs = lng + (np.arange(n) - (n - 1) / 2) * dlng
    LAT, LNG = np.meshgrid(lats, lngs, indexing="ij")
    return LAT, LNG, dlat, dlng, cell_m


def _geotiff(LAT, LNG):
    path = os.getenv("DEM_GEOTIFF")
    if not path or not os.path.exists(path):
        return None
    try:
        import rasterio
    except ImportError:
        return None
    with rasterio.open(path) as ds:
        if not (ds.crs and ds.crs.is_geographic):
            print("[terrain] DEM_GEOTIFF must be in a geographic CRS (EPSG:4326). Skipping.")
            return None
        b = ds.bounds
        if not (b.left <= LNG.min() and LNG.max() <= b.right and b.bottom <= LAT.min() and LAT.max() <= b.top):
            return None
        vals = np.array([v[0] for v in ds.sample(zip(LNG.ravel(), LAT.ravel()))], dtype=float)
        if ds.nodata is not None:
            vals[vals == ds.nodata] = np.nan
    return vals.reshape(LAT.shape)


def _open_meteo(LAT, LNG):
    lats, lngs, out = LAT.ravel(), LNG.ravel(), []
    with httpx.Client(timeout=15) as c:
        for i in range(0, len(lats), 100):  # API limit: 100 coordinates per request
            r = c.get(
                ELEV_URL,
                params={
                    "latitude": ",".join(f"{v:.5f}" for v in lats[i : i + 100]),
                    "longitude": ",".join(f"{v:.5f}" for v in lngs[i : i + 100]),
                },
            )
            r.raise_for_status()
            out.extend(r.json()["elevation"])
    return np.array([np.nan if v is None else v for v in out], dtype=float).reshape(LAT.shape)


def _synthetic(LAT, LNG):
    """Deterministic fake hills and a valley. NOT real terrain. Demo fallback only."""
    seed = int(abs(LAT.mean() * 1e4) + abs(LNG.mean() * 1e4)) % (2**32)
    rng = np.random.default_rng(seed)
    n = LAT.shape[0]
    y, x = np.mgrid[0:n, 0:n] / max(n - 1, 1)
    z = np.zeros((n, n))
    for _ in range(4):
        fx, fy = rng.uniform(0.5, 2.5, 2)
        px, py = rng.uniform(0, 6.28, 2)
        z += rng.uniform(2, 8) * np.sin(2 * np.pi * fx * x + px) * np.cos(2 * np.pi * fy * y + py)
    valley = np.exp(-((x - (0.35 + 0.3 * np.sin(3 * y))) ** 2) / 0.01)
    return 20 + z - 10 * valley


def get_elevation(LAT, LNG, remote=True):
    key = (round(float(LAT.mean()), 4), round(float(LNG.mean()), 4), LAT.shape[0], round(float(np.ptp(LAT)), 4), remote)
    if key in _cache:
        return _cache[key]
    sources = [("GeoTIFF (local DEM)", _geotiff)]
    if remote:
        sources.append(("Copernicus GLO-90 (~90 m) via Open-Meteo", _open_meteo))
    for name, fn in sources:
        try:
            arr = fn(LAT, LNG)
            if arr is not None and np.isfinite(arr).any():
                arr = np.where(np.isfinite(arr), arr, np.nanmean(arr))
                _cache[key] = (arr, name)  # terrain is static, so cache real data only
                if len(_cache) > 40:
                    _cache.pop(next(iter(_cache)))
                return arr, name
        except Exception as e:  # noqa: BLE001
            print(f"[terrain] {name} failed: {e}")
    return _synthetic(LAT, LNG), "synthetic terrain (demo only)"


def derive(elev, cell_m):
    """slope (deg), local relief (m vs 5x5 neighbourhood mean), height above lowest point in the area (m)."""
    gy, gx = np.gradient(elev, cell_m)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    k = 5
    pad = np.pad(elev, k // 2, mode="edge")
    h, w = elev.shape
    mean = sum(pad[i : i + h, j : j + w] for i in range(k) for j in range(k)) / (k * k)
    return slope, elev - mean, elev - np.nanmin(elev)