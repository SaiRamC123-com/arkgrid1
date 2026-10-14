export const CRITERIA = [
  { key: "severity", label: "Severity", hex: "#FF5A6E", hint: "Incident severity from reports and SOS" },
  { key: "vulnerability", label: "Vulnerability", hex: "#B160AF", hint: "Medical vulnerability and mobility of the people involved" },
  { key: "hazard", label: "Flood hazard", hex: "#6366F1", hint: "Assessed water flow, or the prototype flood-risk tier" },
  { key: "headcount", label: "Headcount", hex: "#22D3EE", hint: "People involved (log scale, saturates near 20)" },
  { key: "time", label: "Waiting time", hex: "#67E8F9", hint: "Rises with time since the first request (4 h time constant)" },
];

export const KEYS = CRITERIA.map((c) => c.key);

export const scoreOf = (c, w) => {
  const tot = KEYS.reduce((a, k) => a + w[k], 0) || 1;
  return (100 * KEYS.reduce((a, k) => a + w[k] * c[k], 0)) / tot;
};

// Display bands only. The cut-offs are arbitrary, not clinical triage categories.
export const BANDS = [
  { min: 70, label: "Highest", hex: "#FF5A6E" },
  { min: 45, label: "High", hex: "#B160AF" },
  { min: 25, label: "Medium", hex: "#6366F1" },
  { min: 0, label: "Lower", hex: "#22D3EE" },
];
export const bandOf = (s) => BANDS.find((b) => s >= b.min);