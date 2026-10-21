import axios from "axios";
import api from "./api";
import { buildWeatherLocations, normalizeOpenMeteoGrid, OPEN_METEO_FORECAST_URL } from "../utils/heatWeather";

// Open-Meteo is called straight from the user's device, so every user has their own rate limit
// instead of all users sharing the ArkGrid server's address.
async function fetchDirect({ latitude, longitude, radiusKm, signal }) {
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
  return normalizeOpenMeteoGrid(response.data, latitude, longitude, radiusKm, Date.now(), "");
}

export async function getHeatGrid({ latitude, longitude, radiusKm, refresh = false, signal }) {
  let directError;
  try {
    return await fetchDirect({ latitude, longitude, radiusKm, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    directError = error;
  }

  // Backup: the ArkGrid API (Open-Meteo, then MET Norway on the server).
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
    if (signal?.aborted) throw apiError;
    const apiStatus = apiError.response?.status;
    const error = new Error(
      `Weather could not be loaded. Direct Open-Meteo failed (${directError?.response?.status || directError?.message}) and the ArkGrid API failed (${apiStatus || apiError.message}).`
    );
    error.providerFallbackError = true;
    error.cause = apiError;
    throw error;
  }
}