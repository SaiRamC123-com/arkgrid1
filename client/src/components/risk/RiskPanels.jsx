import { CloudRain, Mountain, X, Info, ExternalLink } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import Badge from "../ui/Badge";
import { TIERS } from "./riskMeta";

export function TierBar({ summary }) {
  return (
    <GlassCard>
      <h3 className="font-display text-lg font-semibold">Risk mask</h3>
      <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-white/10">
        {summary.pct.map((p, i) => (
          <div key={i} style={{ width: `${p}%`, background: TIERS[i].hex }} title={`${TIERS[i].label} ${p}%`} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {TIERS.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: t.hex }} /> {t.label}</span>
            <span className="text-slate-400">{summary.pct[t.id]}%</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Share of the analysed area in each tier. Tiers are relative susceptibility, not water depth or arrival time.</p>
    </GlassCard>
  );
}

const monitorColors = {
  RED: "#fb7185",
  YELLOW: "#fbbf24",
  GREEN: "#4ade80",
  UNKNOWN: "#94a3b8",
};
const eventColors = { Red: "#fb7185", Orange: "#fbbf24", Green: "#4ade80" };

function retrievedLabel(provider) {
  if (!provider.available) return "Unavailable";
  if (provider.stale) return "Cached / stale";
  if (provider.coverage && !provider.coverage.complete) return "Partial data";
  return provider.retrievedAt ? `Retrieved ${new Date(provider.retrievedAt).toLocaleString()}` : "Available";
}

function amountRange(min, max) {
  if (min === null || max === null) return "Unavailable";
  return min === max ? `${min.toFixed(1)} mm` : `${min.toFixed(1)}–${max.toFixed(1)} mm`;
}

function amountExtent(points, field) {
  const values = points.map((point) => point[field]).filter((value) => value !== null);
  return values.length ? amountRange(Math.min(...values), Math.max(...values)) : "Unavailable";
}

export function FloodMonitoringPanel({ result, error, loading }) {
  if (!result) {
    return (
      <GlassCard className="space-y-2">
        <h3 className="font-display text-lg font-semibold">Live flood monitoring</h3>
        {loading && <p className="text-sm text-slate-400">Checking weather, alerts, and verified field reports…</p>}
        {error && <p className="text-sm text-ark-coral">{error}</p>}
        {!loading && !error && <p className="text-sm text-slate-400">Choose a location and analyse the area to load current monitoring data.</p>}
      </GlassCard>
    );
  }

  const providers = [
    ["Precipitation model", result.weather],
    ["GDACS flood/cyclone alerts", result.alerts],
    ["ArkGrid submerged-road reports", result.fieldReports.sources.reports],
    ["ArkGrid flooded-road records", result.fieldReports.sources.roads],
  ];

  return (
    <GlassCard className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400">Independent live-data screen</p>
          <h3 className="mt-1 font-display text-xl font-bold" style={{ color: monitorColors[result.status] }}>
            {result.status} <span className="text-white">· Flood monitoring</span>
          </h3>
          <p className="mt-1 text-sm text-slate-300">{result.summary}</p>
        </div>
        <p className="text-xs text-slate-500">
          {result.sampleCount} weather samples · {result.radiusKm} km radius · generated {new Date(result.generatedAt).toLocaleString()}
        </p>
      </div>

      {error && <p className="rounded-xl border border-ark-coral/40 bg-ark-coral/10 px-3 py-2 text-sm text-ark-coral">{error}</p>}
      {loading && <p className="text-xs text-slate-400">Refreshing monitoring data…</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-400">Open-Meteo next 24 h estimate</p>
          <p className="mt-1 font-display text-xl font-bold text-ark-cyan">
            {amountRange(result.weather.coverage.minForecast24Mm, result.weather.coverage.maxForecast24Mm)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Model output across {result.weather.coverage.availableSamples}/{result.weather.coverage.totalSamples} samples; not rain-gauge data.
          </p>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-400">Official / verified flood signals</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-100">
            {result.alerts.events.filter((event) => event.hazardType === "flood" && event.status === "Ongoing (GDACS)").length} active GDACS flood alerts · {result.fieldReports.reports.length} verified field reports
          </p>
          <p className="mt-1 text-xs text-slate-500">Cyclone alerts are shown on the map but do not classify flood risk.</p>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Source coverage</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {providers.map(([label, provider]) => (
            <div key={label} className="rounded-xl bg-white/[0.035] px-3 py-2">
              <p className="text-sm text-slate-200">{label}</p>
              <p className={`mt-0.5 text-xs ${provider.available ? "text-emerald-300" : "text-ark-coral"}`}>
                {retrievedLabel(provider)}
              </p>
              {(provider.error || provider.warning) && <p className="mt-1 text-xs text-amber-200">{provider.error || provider.warning}</p>}
            </div>
          ))}
        </div>
      </div>

      {(result.alerts.events.length > 0 || result.fieldReports.reports.length > 0) && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Nearby mapped signals</h4>
          {result.alerts.events.map((event) => (
            <div key={event.id} className="rounded-xl bg-white/[0.035] px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2">
                <b style={{ color: eventColors[event.severity] || "#c4b5fd" }}>
                  GDACS {event.severity || "severity unavailable"}
                </b>
                <span className="text-slate-200">{event.title}</span>
                <span className="text-xs text-slate-500">{event.hazardType} · {event.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {event.location} · started {event.time ? new Date(event.time).toLocaleString() : "time unavailable"}
                {event.expiresAt ? ` · provider end ${new Date(event.expiresAt).toLocaleString()}` : ""}
                {event.updated ? ` · updated ${new Date(event.updated).toLocaleString()}` : ""}
              </p>
              {event.url && (
                <a className="mt-1 inline-flex items-center gap-1 text-xs text-ark-cyan hover:underline"
                  href={event.url} target="_blank" rel="noreferrer">
                  GDACS event details <ExternalLink size={12} />
                </a>
              )}
            </div>
          ))}
          {result.fieldReports.reports.map((report) => (
            <div key={report.id} className="rounded-xl bg-white/[0.035] px-3 py-2 text-sm">
              <b className="text-ark-coral">{report.title}</b>
              <span className="ml-2 text-xs text-slate-500">{report.source} · {new Date(report.reportedAt).toLocaleString()}</span>
              {report.description && <p className="mt-1 text-xs text-slate-300">{report.description}</p>}
            </div>
          ))}
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-slate-300">How to interpret this screen</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
          {result.interpretation.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Rainfall across samples: now {amountExtent(result.weather.points, "currentPrecipitationMm")} · previous 24 h model estimate {amountExtent(result.weather.points, "past24Mm")} · peak forecast hour {amountExtent(result.weather.points, "peakForecastHourlyMm")}.
        </p>
      </details>
      <p className="border-t border-white/10 pt-3 text-xs leading-relaxed text-slate-500">
        GREEN is a source-coverage result, not a safety clearance. Weather rainfall is displayed without an unvalidated flood threshold. Markers are individual samples, GDACS point centroids, or verified report locations—not flood boundaries.
      </p>
    </GlassCard>
  );
}

export function RainPanel({ inputs, sources }) {
  const w = inputs.weather;
  return (
    <GlassCard>
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><CloudRain size={19} className="text-ark-cyan" /> Rainfall used</h3>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/5 p-3">
          <p className="font-display text-2xl font-bold text-ark-cyan">{inputs.rain_24h_mm}<span className="text-sm text-slate-400"> mm</span></p>
          <p className="text-xs text-slate-400">24 h total</p>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <p className="font-display text-2xl font-bold text-indigo-300">{inputs.rain_1h_mm}<span className="text-sm text-slate-400"> mm</span></p>
          <p className="text-xs text-slate-400">Peak 1 h total</p>
        </div>
      </div>
      {w && (
        <p className="mt-3 text-xs text-slate-400">Past 24 h: {w.past24_mm} mm · Next 24 h: {w.next24_mm} mm · Current hour: {w.now_mm} mm</p>
      )}
      <p className="mt-2 text-xs text-slate-500">Source: {sources.rain}</p>
    </GlassCard>
  );
}

export function MonitoringZoneBar({ summary, status, basis }) {
  if (!summary) return null;
  const pct = summary.pct || { GREEN: 0, YELLOW: 0, RED: 0, UNKNOWN: 0 };
  const categories = [
    { id: "GREEN", label: "Low Risk", hex: "#4ade80", pct: pct.GREEN || 0 },
    { id: "YELLOW", label: "Flood Watch", hex: "#fbbf24", pct: pct.YELLOW || 0 },
    { id: "RED", label: "High Risk / Confirmed", hex: "#fb7185", pct: pct.RED || 0 },
    { id: "UNKNOWN", label: "Unavailable", hex: "#94a3b8", pct: pct.UNKNOWN || 0 },
  ];

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Real-data risk zones</h3>
        <span className="text-xs uppercase tracking-wider text-slate-400">
          Area status: <b style={{ color: monitorColors[status] || "#fff" }}>{status}</b> ({basis})
        </span>
      </div>
      <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-white/10">
        {categories.map((c) => (
          <div
            key={c.id}
            style={{ width: `${c.pct}%`, background: c.hex }}
            title={`${c.label} ${c.pct}%`}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: c.hex }} />
              {c.label}
            </span>
            <span className="text-slate-400">{c.pct}%</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Share of the assessed area in each category based on real Open-Meteo rainfall, GDACS alerts, and verified ArkGrid reports.
      </p>
    </GlassCard>
  );
}

export function CellDetail({ cell, onClose }) {
  const isRealData = Boolean(cell.status);
  const t = cell.tier !== undefined ? TIERS[cell.tier] : null;
  const headerColor = isRealData ? (monitorColors[cell.status] || "#94a3b8") : (t?.hex || "#22D3EE");

  const basisLabel = {
    observation: "Confirmed Ground Observation",
    official_alert: "Official Flood Alert",
    forecast: "Meteorological Forecast",
    insufficient_data: "Incomplete / Unavailable Data",
  }[cell.basis] || "Real-Data Flood Assessment";

  return (
    <GlassCard className="space-y-4" style={{ borderColor: `${headerColor}88` }}>
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-navy-900 font-bold"
          style={{ background: headerColor }}
        >
          {isRealData ? (cell.status === "RED" ? "!" : cell.status === "YELLOW" ? "▲" : cell.status === "GREEN" ? "✓" : "?") : <Mountain size={22} />}
        </div>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-slate-400">
            Selected cell ({cell.lat.toFixed(4)}, {cell.lng.toFixed(4)})
          </p>
          <p className="font-display text-xl font-bold">
            {isRealData ? `${cell.status} · ${basisLabel}` : `${t?.label || "Cell"} susceptibility`}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {isRealData ? (
              <Badge tone={cell.status === "RED" ? "coral" : cell.status === "YELLOW" ? "amber" : cell.status === "GREEN" ? "cyan" : "slate"}>
                {cell.basis ? cell.basis.toUpperCase() : cell.status}
              </Badge>
            ) : (
              <Badge tone={t?.tone || "cyan"}>Score {Math.round((cell.score || 0) * 100)}%</Badge>
            )}
            {cell.currentPrecipitationMm !== undefined && cell.currentPrecipitationMm !== null && (
              <span className="text-xs text-slate-400">Current rain: {cell.currentPrecipitationMm.toFixed(1)} mm</span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
          <X size={18} />
        </button>
      </div>

      {isRealData && cell.reason && (
        <p className="rounded-xl bg-white/[0.04] p-3 text-sm text-slate-200">
          {cell.reason}
        </p>
      )}

      {isRealData && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center">
          {[
            ["Forecast 24h", cell.rain24Mm !== null && cell.rain24Mm !== undefined ? `${cell.rain24Mm.toFixed(1)} mm` : "—"],
            ["Past 24h", cell.past24Mm !== null && cell.past24Mm !== undefined ? `${cell.past24Mm.toFixed(1)} mm` : "—"],
            ["Peak hourly", cell.peakHourlyMm !== null && cell.peakHourlyMm !== undefined ? `${cell.peakHourlyMm.toFixed(1)} mm` : "—"],
            ["Current rain", cell.currentPrecipitationMm !== null && cell.currentPrecipitationMm !== undefined ? `${cell.currentPrecipitationMm.toFixed(1)} mm` : "0.0 mm"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-white/5 p-2">
              <p className="font-semibold text-slate-100">{v}</p>
              <p className="text-[11px] text-slate-400">{l}</p>
            </div>
          ))}
        </div>
      )}

      {cell.elev !== undefined && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Elevation", `${cell.elev} m`], ["Slope", `${cell.slope}°`], ["Relief", `${cell.relief > 0 ? "+" : ""}${cell.relief} m`]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-white/5 p-2">
              <p className="font-semibold">{v}</p>
              <p className="text-[11px] text-slate-400">{l}</p>
            </div>
          ))}
        </div>
      )}

      {cell.p && (
        <div className="space-y-1.5">
          {TIERS.map((x) => (
            <div key={x.id} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-slate-400">{x.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${cell.p[x.id] * 100}%`, background: x.hex }} />
              </div>
              <span className="w-10 text-right text-slate-400">{Math.round(cell.p[x.id] * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

export function AnalysisMethodsCard({ methods, thresholds, mlOffline }) {
  const methodItems = methods || [
    { id: "meteo", name: "Open-Meteo High-Resolution Precipitation Grid", available: true, type: "forecast_model" },
    { id: "gdacs", name: "GDACS Global Disaster Flood & Cyclone Alerts", available: true, type: "official_alerts" },
    { id: "reports", name: "ArkGrid Verified On-The-Ground Inundation Reports", available: true, type: "verified_observations" },
    { id: "ml", name: "ML Terrain Susceptibility Model (90 m DEM)", available: !mlOffline, type: "prototype_model" },
  ];

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Info size={18} className="text-ark-indigo" /> Analysis methods & documented criteria
        </h3>
        <span className="text-xs text-slate-400">Independent multi-provider screening</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {methodItems.map((m) => (
          <div key={m.id || m.name} className="rounded-xl bg-white/[0.035] p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200">{m.name}</span>
              <span className={`text-xs font-semibold ${m.available ? "text-emerald-300" : "text-amber-300"}`}>
                {m.available ? "Active" : "Offline / Optional"}
              </span>
            </div>
            {m.note && <p className="mt-1 text-xs text-slate-400">{m.note}</p>}
            {m.retrievedAt && <p className="mt-0.5 text-[11px] text-slate-500">Updated: {new Date(m.retrievedAt).toLocaleTimeString()}</p>}
          </div>
        ))}
      </div>

      {thresholds && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-slate-300 space-y-1">
          <p className="font-semibold text-slate-200">Documented Warning Thresholds Applied ({thresholds.standard || "IMD / WMO Guidance"}):</p>
          <ul className="list-disc pl-5 space-y-0.5 text-slate-400">
            <li><b className="text-amber-300">Yellow (Heavy Rain Watch):</b> 24 h rainfall ≥ {thresholds.heavyRain24hMm} mm or peak hourly ≥ {thresholds.heavyRain1hMm} mm/h.</li>
            <li><b className="text-rose-300">Red (High Flood Risk / Extreme Rain):</b> 24 h rainfall ≥ {thresholds.veryHeavyRain24hMm} mm or peak hourly ≥ {thresholds.torrentialRain1hMm} mm/h.</li>
            <li><b className="text-rose-300">Red (Confirmed Flood):</b> Any verified submerged-road or flooded-road report in the area.</li>
            <li><b className="text-emerald-300">Green (Low Risk):</b> Normal rainfall (&lt; {thresholds.heavyRain24hMm} mm), no active official alerts or reports, and all feeds complete.</li>
            <li><b className="text-slate-300">Unknown:</b> Incomplete, missing, or stale coverage. Never classified as green.</li>
          </ul>
        </div>
      )}
    </GlassCard>
  );
}

export function ModelCard({ result }) {
  if (!result) return null;
  const { sources, model, inputs, cell } = result;
  const rows = [
    ["Terrain", sources.elevation],
    ["Rainfall", sources.rain],
    ["Soil", sources.soil],
    ["Grid cell", `about ${cell.size_m} m`],
    ["Model", `Gradient-boosted classifier · ${model.mode === "tier4" ? "4-tier" : "binary, mapped to tiers"}`],
    ["Trained on", model.trained_on],
    ["Real-world validation", "None yet"],
  ];
  return (
    <GlassCard>
      <details>
        <summary className="flex cursor-pointer items-center gap-2 font-display text-lg font-semibold">
          <Info size={18} className="text-ark-indigo" /> Data and model card
        </summary>
        <div className="mt-4 space-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 rounded-xl bg-white/5 px-3 py-2">
              <span className="shrink-0 text-slate-400">{k}</span>
              <span className="text-right">{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {model.kind === "synthetic-heuristic"
            ? "This model was trained on synthetic labels generated from a documented heuristic, so it reproduces our assumptions rather than observed floods. "
            : "This model was trained on a supplied dataset and has not been independently benchmarked. "}
          Slope and relief are coarse at this resolution, and soil permeability is assumed. Benchmark against public datasets such as Copernicus EMS flood extents before relying on it.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Contains Copernicus DEM GLO-90 elevation data and weather data, both served by Open-Meteo.com.
        </p>
      </details>
    </GlassCard>
  );
}