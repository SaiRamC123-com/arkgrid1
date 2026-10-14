"""Probable search zones (Model 03): Monte Carlo kinematic drift with elevation decay.

Particles start at the last-known location (with position uncertainty) and are advected for the
elapsed time by:
  1. drift   : downslope flow from the DEM, optionally blended with an ASSESSED flow vector
  2. walking : a persistent random walk (only for people who can move)
Each particle is then weighted by exp(-uphill_gain / decay_m): water-borne victims rarely end up
higher than where they started. The weighted particle cloud becomes a density map, and the smallest
sets of cells holding 50 / 75 / 90 % of the probability mass become the zones.

ALL speeds and decay lengths below are ASSUMPTIONS. The model is not validated against real
search-and-rescue outcomes. Its output is area guidance, not exact tracking.
"""
import math
from datetime import datetime, timezone

import numpy as np

from flood_risk.terrain import M_LAT, M_LNG, build_grid, get_elevation

SITUATIONS = {
    "water_borne": {"label": "Swept by water", "drift": 1.0, "walk": 0.0, "decay_m": 2.0},
    "on_foot": {"label": "On foot, moving", "drift": 0.3, "walk": 0.4, "decay_m": 15.0},
    "stranded": {"label": "Stranded in place", "drift": 0.15, "walk": 0.02, "decay_m": 3.0},
}
DEFAULT_FLOW_MS = 0.5   # assumed floodwater drift speed when nobody has assessed it
ASSESSED_BLEND = 0.7    # weight of an assessed flow direction vs terrain downslope direction
DT = 300.0              # simulation step (s)
LEVELS = (0.5, 0.75, 0.9)
GRID = 24               # terrain grid (24 x 24 DEM samples)
BINS = 48               # density grid resolution


def _rings(mask, to_ll):
    """Outer boundaries of a grid-aligned cell set as lat/lng rings (holes are filled)."""
    m = mask.shape[0]
    nxt = {}

    def add(a, b):
        nxt.setdefault(a, []).append(b)

    for i in range(m):
        for j in range(m):
            if not mask[i, j]:
                continue
            if i == 0 or not mask[i - 1, j]:
                add((i, j), (i, j + 1))
            if j == m - 1 or not mask[i, j + 1]:
                add((i, j + 1), (i + 1, j + 1))
            if i == m - 1 or not mask[i + 1, j]:
                add((i + 1, j + 1), (i + 1, j))
            if j == 0 or not mask[i, j - 1]:
                add((i + 1, j), (i, j))

    rings = []
    while nxt:
        start = next(iter(nxt))
        pts, cur = [start], start
        while True:
            outs = nxt.get(cur)
            if not outs:
                break
            nx = outs.pop()
            if not outs:
                del nxt[cur]
            if nx == start:
                break
            pts.append(nx)
            cur = nx
        if len(pts) < 4:
            continue
        area = 0.5 * sum(pts[k][1] * pts[(k + 1) % len(pts)][0] - pts[(k + 1) % len(pts)][1] * pts[k][0] for k in range(len(pts)))
        if area <= 0:  # clockwise = hole
            continue
        keep = []
        for k in range(len(pts)):
            a, b, c = pts[k - 1], pts[k], pts[(k + 1) % len(pts)]
            if (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) != 0:
                keep.append(b)
        rings.append([to_ll(i, j) for i, j in keep])
    return rings


def _smooth(a):
    p = np.pad(a, 1, mode="edge")
    k = (1.0, 2.0, 1.0)
    row = (p[:-2] * k[0] + p[1:-1] * k[1] + p[2:] * k[2]) / 4.0
    return (row[:, :-2] * k[0] + row[:, 1:-1] * k[1] + row[:, 2:] * k[2]) / 4.0


def estimate(lat, lng, elapsed_min, situation, bearing_deg, speed_ms, accuracy_m, seed, n_particles=4000):
    cfg = SITUATIONS[situation]
    warnings = []
    if elapsed_min > 1440:
        warnings.append("More than 24 h have passed. The simulation is capped at 24 h, so the real zone is probably larger.")
    T = min(float(elapsed_min), 1440.0) * 60.0

    flow = DEFAULT_FLOW_MS if speed_ms is None else float(speed_ms)
    sigma0 = max(float(accuracy_m), 30.0)
    reach = 1.5 * (flow * cfg["drift"] + cfg["walk"]) * T + 3 * sigma0
    radius = float(np.clip(reach, 1200.0, 8000.0))  # >= 1200 m keeps cells >= 90 m, the DEM resolution

    LAT, LNG, _, _, cell_m = build_grid(lat, lng, radius, GRID)
    elev, src = get_elevation(LAT, LNG)
    if src.startswith("synthetic"):
        warnings.append("Real terrain could not be loaded. Drift directions come from made-up demo terrain and are meaningless.")

    gy, gx = np.gradient(elev, cell_m)
    slope = np.hypot(gx, gy)
    safe = np.maximum(slope, 1e-9)
    ux, uy = np.where(slope > 1e-9, -gx / safe, 0.0), np.where(slope > 1e-9, -gy / safe, 0.0)  # downslope unit vector
    ft = slope / (slope + 0.02)  # terrain drive: half strength at a 2 % slope
    half = (GRID - 1) / 2.0

    def sample(field, x, y):
        fi = np.clip(y / cell_m + half, 0, GRID - 1.001)
        fj = np.clip(x / cell_m + half, 0, GRID - 1.001)
        i0, j0 = fi.astype(int), fj.astype(int)
        di, dj = fi - i0, fj - j0
        return (field[i0, j0] * (1 - di) * (1 - dj) + field[i0 + 1, j0] * di * (1 - dj)
                + field[i0, j0 + 1] * (1 - di) * dj + field[i0 + 1, j0 + 1] * di * dj)

    if float(np.mean(slope)) < 0.005 and bearing_deg is None and cfg["drift"] > 0.2:
        warnings.append("The terrain here is almost flat, so the drift direction is mostly undetermined. Add an assessed flow direction if you can.")

    rng = np.random.default_rng(seed)
    x = rng.normal(0, sigma0, n_particles)
    y = rng.normal(0, sigma0, n_particles)
    z_start = sample(elev, x, y)
    theta = rng.uniform(0, 2 * np.pi, n_particles)
    activity = rng.uniform(0, 1, n_particles)  # some people stay put
    limit = (half + 0.49) * cell_m
    escaped = np.zeros(n_particles, dtype=bool)

    a_vec = None
    if bearing_deg is not None:
        b = math.radians(bearing_deg)
        a_vec = (math.sin(b), math.cos(b))  # (east, north) = direction the water flows TOWARD

    steps = max(1, int(math.ceil(T / DT)))
    dt = T / steps
    for _ in range(steps):
        tx, ty, f = sample(ux, x, y), sample(uy, x, y), sample(ft, x, y)
        vx, vy = flow * f * tx, flow * f * ty
        if a_vec is not None:
            vx = ASSESSED_BLEND * flow * a_vec[0] + (1 - ASSESSED_BLEND) * vx
            vy = ASSESSED_BLEND * flow * a_vec[1] + (1 - ASSESSED_BLEND) * vy
        x = x + cfg["drift"] * vx * dt
        y = y + cfg["drift"] * vy * dt
        if cfg["walk"] > 0:
            theta += rng.normal(0, 0.35, n_particles)
            x += cfg["walk"] * activity * dt * np.cos(theta)
            y += cfg["walk"] * activity * dt * np.sin(theta)
        x += rng.normal(0, 0.15 * math.sqrt(dt), n_particles)
        y += rng.normal(0, 0.15 * math.sqrt(dt), n_particles)
        escaped |= (np.abs(x) >= limit) | (np.abs(y) >= limit)
        x, y = np.clip(x, -limit, limit), np.clip(y, -limit, limit)

    esc_pct = float(escaped.mean())
    if esc_pct > 0.10:
        warnings.append(f"{round(esc_pct * 100)}% of simulated paths left the analysable area. The zone is clipped and probably underestimates the spread.")

    w = np.exp(-np.maximum(0.0, sample(elev, x, y) - z_start) / cfg["decay_m"])
    w = w / w.sum()

    edges = np.linspace(-radius, radius, BINS + 1)
    H, _, _ = np.histogram2d(y, x, bins=[edges, edges], weights=w)  # axis0 = north, axis1 = east
    P = _smooth(H)
    P = P / P.sum()

    kx = M_LNG * math.cos(math.radians(lat))
    to_ll = lambda i, j: [round(lat + edges[i] / M_LAT, 5), round(lng + edges[j] / kx, 5)]  # noqa: E731
    cell_area_km2 = (2 * radius / BINS) ** 2 / 1e6

    order = np.argsort(-P.ravel())
    cum = np.cumsum(P.ravel()[order])
    zones = []
    for level in LEVELS:
        k = int(np.searchsorted(cum, level)) + 1
        mask = np.zeros(P.size, dtype=bool)
        mask[order[:k]] = True
        zones.append({"p": level, "area_km2": round(k * cell_area_km2, 2), "rings": _rings(mask.reshape(P.shape), to_ll)})

    pi, pj = np.unravel_index(int(np.argmax(P)), P.shape)
    peak = {"lat": round(lat + ((edges[pi] + edges[pi + 1]) / 2) / M_LAT, 5), "lng": round(lng + ((edges[pj] + edges[pj + 1]) / 2) / kx, 5)}
    cx, cy = float(np.sum(w * x)), float(np.sum(w * y))
    centroid = {"lat": round(lat + cy / M_LAT, 5), "lng": round(lng + cx / kx, 5)}

    return {
        "lkl": {"lat": lat, "lng": lng},
        "radius_m": round(radius),
        "elapsed_min": round(float(elapsed_min), 1),
        "simulated_min": round(T / 60.0, 1),
        "zones": zones,
        "peak": peak,
        "centroid": centroid,
        "drift": {"distance_m": round(math.hypot(cx, cy)), "bearing_deg": round((math.degrees(math.atan2(cx, cy)) + 360) % 360)},
        "params": {
            "situation": situation, "label": cfg["label"], "flow_speed_ms": round(flow, 2),
            "flow_speed_source": "assessed" if speed_ms is not None else f"assumed {DEFAULT_FLOW_MS} m/s",
            "flow_bearing_deg": bearing_deg,
            "flow_direction_source": "assessed vector blended with terrain" if bearing_deg is not None else "terrain downslope only",
            "accuracy_m": round(sigma0), "particles": n_particles,
        },
        "sources": {"elevation": src},
        "warnings": warnings,
        "model": {
            "name": "Monte Carlo kinematic drift with elevation weighting",
            "validated": False,
            "assumptions": [
                f"Floodwater drift {DEFAULT_FLOW_MS} m/s when unassessed, scaled {cfg['drift']}x for this situation",
                f"Mean walking speed {cfg['walk']} m/s (persistent random walk, some people stay put)",
                f"Elevation decay length {cfg['decay_m']} m",
                "Terrain at 90 m resolution. Buildings, drains, rivers and barriers are not modelled",
            ],
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }