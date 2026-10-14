 """Train / retrain the flood susceptibility model.

  python -m flood_risk.train                              # synthetic demo model
  python -m flood_risk.train --csv data/flood_samples.csv # your real dataset
"""
import argparse
import json
from pathlib import Path

from .model import load_csv, synthetic_dataset, train

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="CSV with the 7 feature columns plus 'tier' (0-3) or 'flooded' (0/1)")
    a = ap.parse_args()
    if a.csv:
        X, y, mode = load_csv(a.csv)
        card = train(X, y, f"dataset: {Path(a.csv).name}", "real-dataset", mode)
    else:
        X, y = synthetic_dataset()
        card = train(X, y, "synthetic heuristic labels (demo)", "synthetic-heuristic")
    print(json.dumps(card, indent=2))