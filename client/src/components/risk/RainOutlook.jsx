import { useEffect, useState } from "react";
import axios from "axios";
import { CloudRain, Loader2, WifiOff } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import { RAIN_OUTLOOK_URL, summarizeRainOutlook } from "../../utils/rainOutlook";

const LEVEL_COLOR = {
  dry: "#4ade80",
  possible: "#94a3b8",
  likely: "#fbbf24",
  heavy: "#fb7185",
};

const hhmm = (local) => local.slice(11, 16);

// Live rainfall outlook for the selected point. Loaded straight from Open-Meteo in the browser,
// so it does not depend on the ArkGrid server. A rain forecast is not a flood warning.
export default function RainOutlook({ center }) {
  const [state, setState] = useState({ loading: false, error: null, data: null, at: null });

  useEffect(() => {
    if (!center) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    axios
      .get(RAIN_OUTLOOK_URL, {
        timeout: 15000,
        signal: controller.signal,
        params: {
          latitude: center.lat,
          longitude: center.lng,
          current: "precipitation",
          hourly: "precipitation,precipitation_probability",
          forecast_days: 2,
          timezone: "auto",
        },
      })
      .then((r) => {
        const data = summarizeRainOutlook(r.data);
        setState({
          loading: false,
          data,
          at: new Date().toISOString(),
          error: data ? null : "Open-Meteo returned no usable hourly rainfall for this location.",
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, data: null, at: null, error: err.response?.status ? `Open-Meteo returned ${err.response.status}.` : err.message });
      });
    return () => controller.abort();
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!center) return null;
  const { loading, error, data } = state;

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <CloudRain size={18} className="text-ark-cyan" /> Rain outlook (next 24 h)
        </h3>
        {loading && <Loader2 size={16} className="animate-spin text-ark-cyan" />}
      </div>

      {error && (
        <p className="mt-3 flex items-start gap-2 text-sm text-amber-300">
          <WifiOff size={16} className="mt-0.5 shrink-0" /> Rain outlook unavailable: {error}
        </p>
      )}

      {data && (
        <>
          <p className="mt-3 text-sm text-slate-200">
            {data.nextRain
              ? <>Next expected rain: <b>{data.nextRain.label.toLowerCase()}</b> ({hhmm(data.nextRain.from)}–{hhmm(data.nextRain.to)}), up to <b>{data.nextRain.peakHourMm} mm/h</b>. Total next 24 h: <b>{data.next24Mm} mm</b>.</>
              : <>No rain forecast in the next 24 hours at this point (total {data.next24Mm} mm).</>}
          </p>
          <ul className="mt-3 space-y-2">
            {data.periods.map((p) => (
              <li key={`${p.label}-${p.from}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLOR[p.level.id] }} />
                  <span className="font-semibold">{p.label}</span>
                  <span className="text-xs text-slate-400">{hhmm(p.from)}–{hhmm(p.to)}</span>
                </span>
                <span className="text-right text-xs text-slate-300">
                  {p.level.label} · {p.totalMm} mm{p.maxProbPct !== null ? ` · ${p.maxProbPct}% chance` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Open-Meteo model forecast for {center.lat.toFixed(4)}, {center.lng.toFixed(4)} (local time{data.timezone ? `, ${data.timezone}` : ""}), retrieved {new Date(state.at).toLocaleTimeString()}.
            A rainfall forecast is not a flood warning: it does not show that flooding is happening or will happen. Follow official alerts.
          </p>
        </>
      )}
    </GlassCard>
  );
}