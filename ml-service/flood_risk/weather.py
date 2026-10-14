import httpx
from datetime import datetime, timezone

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
    h = r.json()["hourly"]
    times, vals = h["time"], [v or 0.0 for v in h["precipitation"]]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
    i = times.index(now) if now in times else len(times) // 3
    past, ahead = vals[max(0, i - 23) : i + 1], vals[i + 1 : i + 25]
    return {
        "past24_mm": round(sum(past), 1),
        "next24_mm": round(sum(ahead), 1),
        "peak_hour_mm": round(max(past + ahead or [0.0]), 1),
        "now_mm": round(vals[i], 1),
    }