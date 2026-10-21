// Rain outlook for one point from Open-Meteo hourly data (local times, timezone=auto).
// This is a rainfall FORECAST. It is not a flood warning and says nothing about flooding by itself.

export const RAIN_OUTLOOK_URL = "https://api.open-meteo.com/v1/forecast";

const PERIODS = [
  { key: "night", name: "night", from: 21, to: 24 },
  { key: "early", name: "night", from: 0, to: 5 },
  { key: "morning", name: "morning", from: 5, to: 12 },
  { key: "afternoon", name: "afternoon", from: 12, to: 17 },
  { key: "evening", name: "evening", from: 17, to: 21 },
];

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function periodFor(hour) {
  return PERIODS.find((p) => hour >= p.from && hour < p.to) || PERIODS[0];
}

export function rainLevel({ totalMm, maxProbPct, peakHourMm }) {
  if (peakHourMm >= 20 || totalMm >= 64.5) return { id: "heavy", label: "Heavy rain forecast" };
  if (totalMm >= 2.5 || (maxProbPct !== null && maxProbPct >= 60 && totalMm >= 0.5)) return { id: "likely", label: "Rain likely" };
  if (totalMm >= 0.2 || (maxProbPct !== null && maxProbPct >= 30)) return { id: "possible", label: "Possible showers" };
  return { id: "dry", label: "Mostly dry" };
}

/** Groups the next 24 local hours into day-periods ("Today afternoon", "Tonight", ...). */
export function summarizeRainOutlook(payload) {
  const hourly = payload?.hourly;
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const precip = Array.isArray(hourly?.precipitation) ? hourly.precipitation : [];
  const prob = Array.isArray(hourly?.precipitation_probability) ? hourly.precipitation_probability : [];
  const nowLocal = typeof payload?.current?.time === "string" ? payload.current.time : null;
  if (!times.length || !nowLocal) return null;

  const nowHour = nowLocal.slice(0, 13); // "YYYY-MM-DDTHH"
  const start = times.findIndex((t) => t.slice(0, 13) >= nowHour);
  if (start < 0) return null;
  const today = nowLocal.slice(0, 10);

  const groups = [];
  for (let i = start; i < Math.min(times.length, start + 24); i++) {
    const mm = num(precip[i]);
    if (mm === null) continue; // missing hours are skipped, never treated as dry
    const date = times[i].slice(0, 10);
    const hour = Number(times[i].slice(11, 13));
    const period = periodFor(hour);
    const dayLabel = date === today ? "Today" : "Tomorrow";
    const label = period.key === "night" && date === today ? "Tonight" : `${dayLabel} ${period.name}`;
    let group = groups[groups.length - 1];
    if (!group || group.label !== label) {
      group = { label, from: times[i], to: times[i], hours: 0, totalMm: 0, peakHourMm: 0, maxProbPct: null };
      groups.push(group);
    }
    group.to = times[i];
    group.hours += 1;
    group.totalMm += mm;
    group.peakHourMm = Math.max(group.peakHourMm, mm);
    const p = num(prob[i]);
    if (p !== null) group.maxProbPct = group.maxProbPct === null ? p : Math.max(group.maxProbPct, p);
  }
  if (!groups.length) return null;

  const periods = groups.map((g) => {
    const totalMm = Number(g.totalMm.toFixed(1));
    const peakHourMm = Number(g.peakHourMm.toFixed(1));
    return { ...g, totalMm, peakHourMm, level: rainLevel({ totalMm, maxProbPct: g.maxProbPct, peakHourMm }) };
  });
  const next24Mm = Number(periods.reduce((s, p) => s + p.totalMm, 0).toFixed(1));
  const nextRain = periods.find((p) => p.level.id !== "dry");
  return { periods, next24Mm, nextRain: nextRain || null, nowLocal, timezone: payload.timezone || null };
}