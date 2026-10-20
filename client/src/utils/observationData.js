const WMO_WEATHER_CODES = new Map([
  [0, "Clear sky"],
  [1, "Mainly clear"],
  [2, "Partly cloudy"],
  [3, "Overcast"],
  [45, "Fog"],
  [48, "Depositing rime fog"],
  [51, "Light drizzle"],
  [53, "Moderate drizzle"],
  [55, "Dense drizzle"],
  [56, "Light freezing drizzle"],
  [57, "Dense freezing drizzle"],
  [61, "Slight rain"],
  [63, "Moderate rain"],
  [65, "Heavy rain"],
  [66, "Light freezing rain"],
  [67, "Heavy freezing rain"],
  [71, "Slight snow fall"],
  [73, "Moderate snow fall"],
  [75, "Heavy snow fall"],
  [77, "Snow grains"],
  [80, "Slight rain showers"],
  [81, "Moderate rain showers"],
  [82, "Violent rain showers"],
  [85, "Slight snow showers"],
  [86, "Heavy snow showers"],
  [95, "Thunderstorm"],
  [96, "Thunderstorm with slight hail"],
  [99, "Thunderstorm with heavy hail"],
]);

export function describeWeatherCode(code) {
  return Number.isInteger(code) ? WMO_WEATHER_CODES.get(code) || "Weather condition not reported" : "Weather condition not reported";
}

export function makeWeatherObservations(points) {
  if (!Array.isArray(points)) return [];
  return points.flatMap((point) => {
    if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90
      || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) return [];
    const hasWeather = Number.isFinite(point.weatherCode)
      || Number.isFinite(point.precipitationMm)
      || Number.isFinite(point.windSpeedKmh)
      || Number.isFinite(point.temperatureC);
    if (!hasWeather) return [];
    return [{
      ...point,
      id: `open-meteo-${point.row}-${point.col}`,
      hazardType: "weather",
      title: describeWeatherCode(point.weatherCode),
      location: `Model grid point ${point.latitude.toFixed(3)}, ${point.longitude.toFixed(3)}`,
      time: point.modelTime,
      updated: null,
      severity: null,
      status: "Current weather estimate (model output; not a disaster alert)",
      source: "Open-Meteo Forecast API",
    }];
  });
}

export function distanceKm(origin, destination) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(destination.latitude - origin.latitude);
  const dLng = radians(destination.longitude - origin.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isObservationInWindow(observation, hours, windowEnd) {
  const timestamp = Date.parse(observation?.time);
  if (!Number.isFinite(timestamp) || !Number.isFinite(windowEnd) || timestamp > windowEnd + 60000) return false;
  return timestamp >= windowEnd - hours * 60 * 60 * 1000
    || observation.status === "Ongoing (GDACS)";
}
