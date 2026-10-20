export function draftAdvisory(sim, severity) {
  const ex = sim.exposure;
  const sc = sim.scenario;
  const what = sim.mode === "surge"
    ? `a rise in water level of about ${sc.surge.height_m} m`
    : `heavy rainfall of about ${sc.rain.intensity_mm_h} mm/h for ${sc.rain.hours} h`;
  const lead = ex.totals.earliestMin != null ? Math.max(5, Math.round(ex.totals.earliestMin / 5) * 5) : null;
  const head = { watch: "Flood watch", warning: "Flood warning", evacuate: "Evacuate low-lying areas" }[severity];
  const action = {
    watch: "Stay alert and check the app for updates.",
    warning: "Prepare to move to higher ground and avoid low-lying roads.",
    evacuate: "If you are in a low-lying area, move to higher ground or an open shelter now.",
  }[severity];
  return {
    title: `${head}: planning scenario`,
    message: `Planning scenario, not a forecast: ${what}. Parts of the area near you could flood${lead ? ` within about ${lead} minutes` : ""}. ${action} Do not walk or drive through floodwater. Check local emergency-management sources for verified shelter locations. Follow official instructions.`.slice(0, 500),
  };
}