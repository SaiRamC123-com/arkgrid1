const FAHRENHEIT = {
  caution: 80,
  extremeCaution: 90,
  danger: 103,
  extremeDanger: 125,
};

export const HEAT_INDEX_BANDS_C = {
  caution: (FAHRENHEIT.caution - 32) * 5 / 9,
  extremeCaution: (FAHRENHEIT.extremeCaution - 32) * 5 / 9,
  danger: (FAHRENHEIT.danger - 32) * 5 / 9,
  extremeDanger: (FAHRENHEIT.extremeDanger - 32) * 5 / 9,
};

export function heatIndexC(temperatureC, humidityPct) {
  if (!Number.isFinite(temperatureC) || !Number.isFinite(humidityPct)
    || humidityPct < 0 || humidityPct > 100) return null;

  const temperatureF = temperatureC * 9 / 5 + 32;
  if (temperatureF < FAHRENHEIT.caution) return temperatureC;

  const humidity = humidityPct;
  let index = -42.379
    + 2.04901523 * temperatureF
    + 10.14333127 * humidity
    - 0.22475541 * temperatureF * humidity
    - 0.00683783 * temperatureF ** 2
    - 0.05481717 * humidity ** 2
    + 0.00122874 * temperatureF ** 2 * humidity
    + 0.00085282 * temperatureF * humidity ** 2
    - 0.00000199 * temperatureF ** 2 * humidity ** 2;

  if (humidity < 13 && temperatureF >= 80 && temperatureF <= 112) {
    index -= ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(temperatureF - 95)) / 17);
  } else if (humidity > 85 && temperatureF >= 80 && temperatureF <= 87) {
    index += ((humidity - 85) / 10) * ((87 - temperatureF) / 5);
  }

  return (index - 32) * 5 / 9;
}
