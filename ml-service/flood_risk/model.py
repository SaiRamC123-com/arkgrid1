"""Flood susceptibility model (Model 01): gradient-boosted classifier, 4 tiers.

IMPORTANT: unless trained on a real dataset (see build_dataset.py / train.py --csv), labels come
from `heuristic_index`, an ASSUMPTION loosely inspired by topographic wetness ideas. The model then
learns that assumption. It is a working prototype of the architecture, not a validated predictor.
"""
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import train_test_split

FEATURES = ["elevation_m", "slope_deg", "relief_m", "height_above_low_m", "soil_perm", "rain_24h_mm", "rain_1h_mm"]
TIERS = ["Low", "Moderate", "High", "Severe"]
BINARY_THRESHOLDS = [0.20, 0.40, 0.65]  # uncalibrated probability bands (binary real-data mode)
ART = Path(__file__).parent / "artifacts"
MODEL_PATH, CARD_PATH = ART / "model.joblib", ART / "model_card.json"
_state = {"bundle": None, "card": None}


def heuristic_index(X):
    _, slope, relief, hal, soil, r24, r1 = X.T
    low = np.clip(1 - hal / 25.0, 0, 1)        # near the lowest ground in the area
    pooling = np.clip(-relief / 6.0, 0, 1)     # lower than the surroundings
    flat = np.clip(1 - slope / 8.0, 0, 1)      # water drains slowly on flat ground
    terrain = 0.45 * low + 0.25 * pooling + 0.20 * flat + 0.10 * (1 - soil)
    eff_rain = r24 * (1 - 0.6 * soil) + 2.0 * r1  # permeable soil absorbs part of the rain
    rain = 1 - np.exp(-eff_rain / 90.0)
    return (0.25 + 0.75 * rain) * terrain


def synthetic_dataset(n=20000, seed=7):
    rng = np.random.default_rng(seed)
    elev = rng.uniform(0, 600, n)
    slope = np.clip(rng.gamma(1.6, 3.0, n), 0, 40)
    relief = np.clip(rng.normal(0, 4, n), -20, 20)
    hal = np.clip(rng.gamma(1.8, 12.0, n), 0, 120)
    soil = rng.uniform(0.05, 0.95, n)
    r24 = np.clip(np.where(rng.random(n) < 0.35, rng.uniform(0, 5, n), rng.gamma(2.0, 45.0, n)), 0, 500)
    r1 = np.clip(r24 * rng.uniform(0.05, 0.4, n), 0, 120)
    X = np.column_stack([elev, slope, relief, hal, soil, r24, r1])
    y = np.digitize(heuristic_index(X) + rng.normal(0, 0.04, n), [0.18, 0.35, 0.55])
    return X, y


def load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit("CSV is empty")
    missing = [c for c in FEATURES if c not in rows[0]]
    if missing:
        raise SystemExit(f"CSV is missing columns: {missing}")
    X = np.array([[float(r[c]) for c in FEATURES] for r in rows])
    if not np.isfinite(X).all() or (X[:, 4] < 0).any() or (X[:, 4] > 1).any() or (X[:, 5:] < 0).any():
        raise SystemExit("CSV has invalid values (NaN, soil_perm outside 0-1, or negative rainfall)")
    if "tier" in rows[0]:
        y, mode = np.array([int(float(r["tier"])) for r in rows]), "tier4"
        if y.min() < 0 or y.max() > 3:
            raise SystemExit("tier must be 0-3")
    elif "flooded" in rows[0]:
        y, mode = np.array([int(float(r["flooded"])) for r in rows]), "binary"
        if not set(np.unique(y)) <= {0, 1}:
            raise SystemExit("flooded must be 0 or 1")
    else:
        raise SystemExit("CSV needs a 'tier' (0-3) or 'flooded' (0/1) column")
    return X, y, mode


def train(X, y, source, kind, mode="tier4"):
    y = np.asarray(y).astype(int)
    counts = np.bincount(y)
    strat = y if counts[counts > 0].min() >= 2 else None
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=7, stratify=strat)
    clf = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.08, max_depth=6, l2_regularization=1.0, random_state=7)
    clf.fit(Xtr, ytr)
    pred = clf.predict(Xte)
    holdout = {"n_test": int(len(yte)), "accuracy": round(float((pred == yte).mean()), 3)}
    if mode == "tier4":
        holdout["within_one_tier"] = round(float((abs(pred - yte) <= 1).mean()), 3)

    card = {
        "version": "1.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "trained_on": source,
        "kind": kind,  # "synthetic-heuristic" | "real-dataset"
        "mode": mode,
        "n_samples": int(len(y)),
        "features": FEATURES,
        "class_balance": {str(i): int(c) for i, c in enumerate(counts)},
        "tier_thresholds": BINARY_THRESHOLDS if mode == "binary" else None,
        "holdout": holdout,
        "holdout_note": (
            "Agreement with the SYNTHETIC heuristic on held-out synthetic samples. Not real-world accuracy."
            if kind == "synthetic-heuristic"
            else "Random hold-out from your dataset. Overlapping windows leak, so benchmark with a spatial split before trusting it."
        ),
        "validated_against_real_events": False,
    }
    ART.mkdir(exist_ok=True)
    bundle = {"clf": clf, "mode": mode}
    joblib.dump(bundle, MODEL_PATH)
    CARD_PATH.write_text(json.dumps(card, indent=2))
    _state.update(bundle=bundle, card=card)
    return card


def get_model():
    if _state["bundle"] is None:
        if MODEL_PATH.exists() and CARD_PATH.exists():
            _state["bundle"] = joblib.load(MODEL_PATH)
            _state["card"] = json.loads(CARD_PATH.read_text())
        else:
            print("[flood_risk] No trained model found. Training the synthetic demo model...")
            X, y = synthetic_dataset()
            train(X, y, "synthetic heuristic labels (demo)", "synthetic-heuristic")
    return _state["bundle"], _state["card"]


def predict(X):
    b, card = get_model()
    clf, proba = b["clf"], b["clf"].predict_proba(X)
    if b["mode"] == "tier4":
        p4 = np.zeros((len(X), 4))
        p4[:, clf.classes_.astype(int)] = proba
        return p4.argmax(axis=1), (p4 @ np.array([0.0, 1.0, 2.0, 3.0])) / 3.0, p4
    classes = list(clf.classes_)
    p1 = proba[:, classes.index(1)] if 1 in classes else np.zeros(len(X))
    return np.digitize(p1, card["tier_thresholds"]), p1, None