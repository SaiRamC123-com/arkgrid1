import axios from "axios";
import api from "./api";
import { buildWeatherLocations, normalizeOpenMeteoGrid, OPEN_METEO_FORECAST_URL } from "../utils/heatWeather";

export async function getHeatGrid({ latitude, longitude, radiusKm, refresh = false, signal }) {
  try {
    const response = await api.get("/api/weather/heat-grid", {
      params: {
        lat: latitude,
        lng: longitude,
        radiusKm,
        ...(refresh ? { refresh: 1 } : {}),
      },
      signal,
      timeout: 20000,
    });
    return response.data;
  } catch (apiError) {
    if (apiError.response?.status !== 404 || signal?.aborted) throw apiError;
    try {
      const locations = buildWeatherLocations(latitude, longitude, radiusKm);
      const response = await axios.get(OPEN_METEO_FORECAST_URL, {
        timeout: 20000,
        signal,
        params: {
          latitude: locations.map((point) => point.latitude).join(","),
          longitude: locations.map((point) => point.longitude).join(","),
          current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
          hourly: "temperature_2m,apparent_temperature,relative_humidity_2m",
          daily: "temperature_2m_max,temperature_2m_min,apparent_temperature_max",
          forecast_days: 2,
          timezone: "auto",
        },
        headers: { Accept: "application/json" },
      });
      return normalizeOpenMeteoGrid(response.data, latitude, longitude, radiusKm);
    } catch (providerError) {
      if (signal?.aborted) throw providerError;
      const error = new Error(`ArkGrid's weather route returned 404 and direct Open-Meteo retrieval failed: ${providerError.message}`);
      error.providerFallbackError = true;
      error.cause = providerError;
      throw error;
    }
  }
}
