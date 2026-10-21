// One bright colour theme per feature. The background, accents, buttons and cards all follow it,
// so each screen feels like the feature you are in. Colours are "r g b" for use in CSS variables.

const t = (id, scene, colors, accent, accent2) => ({ id, scene, colors, accent, accent2 });

export const THEMES = {
  home: t("home", "dots", ["#bae6fd", "#a5f3fc", "#e0f2fe"], "2 132 199", "8 145 178"),
  family: t("family", "dots", ["#bbf7d0", "#99f6e4", "#d1fae5"], "5 150 105", "13 148 136"),
  sos: t("sos", "pulse", ["#fecaca", "#fda4af", "#fed7aa"], "220 38 38", "234 88 12"),
  reports: t("reports", "dots", ["#e9d5ff", "#fbcfe8", "#ddd6fe"], "147 51 234", "219 39 119"),
  roads: t("roads", "route", ["#fde68a", "#fed7aa", "#fef3c7"], "217 119 6", "234 88 12"),
  risk: t("risk", "waves", ["#7dd3fc", "#67e8f9", "#bfdbfe"], "2 132 199", "37 99 235"),
  observations: t("observations", "radar", ["#c7d2fe", "#a5b4fc", "#bae6fd"], "79 70 229", "8 145 178"),
  "heat-wave": t("heat-wave", "sun", ["#fed7aa", "#fde047", "#fecaca"], "234 88 12", "220 38 38"),
  "disaster-history": t("disaster-history", "grid", ["#e2e8f0", "#ddd6fe", "#fde68a"], "109 40 217", "180 83 9"),
  command: t("command", "grid", ["#c7d2fe", "#bfdbfe", "#a5f3fc"], "67 56 202", "2 132 199"),
  incidents: t("incidents", "pulse", ["#fecdd3", "#fed7aa", "#fde68a"], "225 29 72", "234 88 12"),
  "search-zones": t("search-zones", "radar", ["#a7f3d0", "#bae6fd", "#d9f99d"], "5 150 105", "2 132 199"),
  priority: t("priority", "grid", ["#fbcfe8", "#fecaca", "#fde68a"], "219 39 119", "220 38 38"),
  simulator: t("simulator", "waves", ["#a5f3fc", "#c4b5fd", "#fbcfe8"], "124 58 237", "6 182 212"),
  logistics: t("logistics", "route", ["#fde68a", "#bbf7d0", "#a5f3fc"], "202 138 4", "5 150 105"),
  "drone-safety": t("drone-safety", "radar", ["#bae6fd", "#c7d2fe", "#99f6e4"], "37 99 235", "13 148 136"),
  default: t("default", "dots", ["#bfdbfe", "#c7d2fe", "#a5f3fc"], "37 99 235", "6 182 212"),
};

/** "/citizen/risk" -> "risk", "/command" -> "command", "/citizen" -> "home". */
export function themeKeyForPath(pathname = "") {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "citizen") return parts[1] || "home";
  if (parts[0] === "command") return parts[1] || "command";
  return "default";
}

export function themeForPath(pathname) {
  return THEMES[themeKeyForPath(pathname)] || THEMES.default;
}