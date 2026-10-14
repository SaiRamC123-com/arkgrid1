"""Spatio-temporal incident clustering (Model 02).

SOS bursts and citizen reports are embedded into one metric space:
  x, y = local planar position in meters
  z    = time converted to "meters", so `window_min` minutes of separation
         costs the same as `eps_m` meters of spatial separation.
Two signals are neighbours when their combined distance is <= eps_m.
Signals that join nothing stay as single-signal incidents, so nothing is dropped.
"""
import math
import time
from typing import Dict, List

import numpy as np
from sklearn.cluster import DBSCAN

try:
    from sklearn.cluster import HDBSCAN  # scikit-learn >= 1.3
except ImportError:  # pragma: no cover
    HDBSCAN = None

M_PER_DEG_LAT = 110540.0
M_PER_DEG_LNG = 111320.0


def _embed(lat, lng, t, eps_m, window_min):
    lat0, lng0 = float(np.mean(lat)), float(np.mean(lng))
    kx = M_PER_DEG_LNG * math.cos(math.radians(lat0))
    x = (lng - lng0) * kx
    y = (lat - lat0) * M_PER_DEG_LAT
    z = (t - t.min()) * (eps_m / (window_min * 60.0))
    return np.column_stack([x, y, z]), x, y


def _fit(X, algorithm, eps_m, min_samples):
    n = len(X)
    if n < 2:
        return np.full(n, -1), "dbscan"
    ms = max(1, min(min_samples, n))
    if algorithm == "hdbscan" and HDBSCAN is not None:
        try:
            labels = HDBSCAN(
                min_cluster_size=max(2, ms),
                min_samples=ms,
                cluster_selection_epsilon=eps_m,
                allow_single_cluster=True,
            ).fit_predict(X)
            return labels, "hdbscan"
        except Exception:
            pass  # fall through to DBSCAN
    return DBSCAN(eps=eps_m, min_samples=ms).fit_predict(X), "dbscan"


def cluster_events(
    events: List[dict], algorithm: str, eps_m: float, window_min: float, min_samples: int
) -> Dict:
    t0 = time.perf_counter()
    n = len(events)
    if n == 0:
        return {"clusters": [], "meta": {"algorithm": algorithm, "n_events": 0, "n_clusters": 0, "n_noise": 0, "ms": 0}}

    lat = np.array([e["lat"] for e in events], dtype=float)
    lng = np.array([e["lng"] for e in events], dtype=float)
    t = np.array([e["t"] for e in events], dtype=float)
    w = np.array([e["weight"] for e in events], dtype=float)

    X, x, y = _embed(lat, lng, t, eps_m, window_min)
    labels, used = _fit(X, algorithm, eps_m, min_samples)

    groups: Dict[int, List[int]] = {}
    singles: List[List[int]] = []
    for i, lab in enumerate(labels):
        if lab == -1:
            singles.append([i])
        else:
            groups.setdefault(int(lab), []).append(i)

    clusters = []
    for idx in list(groups.values()) + singles:
        ww = w[idx]
        cx = float(np.average(x[idx], weights=ww))
        cy = float(np.average(y[idx], weights=ww))
        radius = float(np.max(np.hypot(x[idx] - cx, y[idx] - cy))) if len(idx) > 1 else 0.0
        clusters.append(
            {
                "members": [events[i]["id"] for i in idx],
                "centroid": {
                    "lat": float(np.average(lat[idx], weights=ww)),
                    "lng": float(np.average(lng[idx], weights=ww)),
                },
                "radius_m": round(radius, 1),
                "size": len(idx),
                "t_first": float(t[idx].min()),
                "t_last": float(t[idx].max()),
            }
        )
    clusters.sort(key=lambda c: c["t_first"])

    return {
        "clusters": clusters,
        "meta": {
            "algorithm": used,
            "n_events": n,
            "n_clusters": len(clusters),
            "n_noise": len(singles),
            "ms": round((time.perf_counter() - t0) * 1000, 1),
        },
    }