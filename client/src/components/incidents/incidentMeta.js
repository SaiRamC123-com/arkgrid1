export const SEV = {
  critical: { label: "Critical", tone: "coral", hex: "#FF5A6E", rank: 4 },
  high: { label: "High", tone: "coral", hex: "#FF5A6E", rank: 3 },
  medium: { label: "Medium", tone: "indigo", hex: "#6366F1", rank: 2 },
  low: { label: "Low", tone: "cyan", hex: "#22D3EE", rank: 1 },
};

export const OPS = {
  new: { label: "New", tone: "coral" },
  acknowledged: { label: "Acknowledged", tone: "indigo" },
  dispatched: { label: "Dispatched", tone: "cyan" },
};

export const ENGINE = {
  "ml-dbscan": { label: "DBSCAN · ML service", ok: true },
  "ml-hdbscan": { label: "HDBSCAN · ML service", ok: true },
  fallback: { label: "Fallback grouping · ML offline", ok: false },
  none: { label: "No signals yet", ok: true },
};