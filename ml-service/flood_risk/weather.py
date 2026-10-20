import httpx
from datetime import datetime, timezone
from math import isfinite

URL = "https://api.open-meteo.com/v1/forecast"


def fetch_rain(lat, lng):
    r = httpx.get(
        URL,
        params={
            "latitude": f"{lat:.4f}", "longitude": f"{lng:.4f}", "hourly": "precipitation",
            "past_days": 1, "forecast_days": 2, "timezone": "UTC",
        },
        timeout=12,
    )
    r.raise_for_status()
    h = r.json().get("hourly", {})
    times, vals = h.get("time"), h.get("precipitation")
    if not isinstance(times, list) or not isinstance(vals, list) or len(times) != len(vals):
        raise ValueError("Open-Meteo returned an incomplete hourly precipitation series")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
    if now not in times:
        raise ValueError("Open-Meteo did not return the current UTC hour")
    i = times.index(now)
    past, ahead = vals[max(0, i - 23) : i + 1], vals[i + 1 : i + 25]
    if len(past) != 24 or len(ahead) != 24:
        raise ValueError("Open-Meteo did not return complete 24-hour rainfall windows")
    try:
        past = [float(value) for value in past]
        ahead = [float(value) for value in ahead]
    except (TypeError, ValueError) as exc:
        raise ValueError("Open-Meteo returned missing hourly precipitation values") from exc
    if any(not isfinite(value) or value < 0 for value in past + ahead):
        raise ValueError("Open-Meteo returned invalid hourly precipitation")
    return {
        "past24_mm": round(sum(past), 1),
        "next24_mm": round(sum(ahead), 1),
        "peak_hour_mm": round(max(past + ahead), 1),
        "now_mm": round(float(vals[i]), 1),
    }