const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getFloodMonitoring,
  _buildSamplePoints,
  _distanceMeters,
  _normalizeWeatherLocation,
} = require("./floodMonitoringService");

const center = { lat: 12.9716, lng: 77.5946 };

function goodWeather(points, values = {}) {
  return {
    source: "test weather model",
    retrievedAt: "2026-10-17T12:00:00.000Z",
    stale: false,
    points: points.map((point) => ({
      ...point,
      currentPrecipitationMm: 0,
      past24Mm: 0,
      forecast24Mm: 0,
      peakForecastHourlyMm: 0,
      ...values,
    })),
  };
}

function goodAlerts(events = []) {
  return {
    events,
    source: "test alert feed",
    retrievedAt: "2026-10-17T12:00:00.000Z",
    stale: false,
  };
}

function goodReports(reports = [], roads = []) {
  const retrievedAt = "2026-10-17T12:00:00.000Z";
  return {
    reports,
    roads,
    sources: {
      reports: { available: true, source: "test reports", retrievedAt },
      roads: { available: true, source: "test roads", retrievedAt },
    },
  };
}

function providers(overrides = {}) {
  return {
    getWeather: async (points) => goodWeather(points),
    getHazardAlerts: async () => goodAlerts(),
    getFieldReports: async () => goodReports(),
    ...overrides,
  };
}

test("sampling detail controls the number of bounded weather points", () => {
  const expected = [[10, 5], [14, 13], [20, 29]];
  for (const [grid, count] of expected) {
    const points = _buildSamplePoints(center.lat, center.lng, 3, grid);
    assert.equal(points.length, count);
    assert.equal(new Set(points.map((point) => `${point.lat},${point.lng}`)).size, count);
    assert.ok(points.every((point) => _distanceMeters(center, point) <= 3005));
  }
});

test("complete sources with no elevated official or verified signal return GREEN", async () => {
  const result = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, providers());
  assert.equal(result.status, "GREEN");
  assert.equal(result.sampleCount, 13);
  assert.equal(result.weather.coverage.complete, true);
  assert.deepEqual(result.alerts.events, []);
});

test("active GDACS red/orange flood alerts produce RED/YELLOW, while cyclone alerts do not", async () => {
  const active = {
    id: "gdacs-FL-1-1",
    hazardType: "flood",
    status: "Ongoing (GDACS)",
    severity: "Red",
    latitude: center.lat,
    longitude: center.lng,
    title: "Flood event",
    time: "2026-10-17T10:00:00.000Z",
  };
  const red = await getFloodMonitoring({ ...center, radiusKm: 1, grid: 10 }, providers({
    getHazardAlerts: async () => goodAlerts([active]),
  }));
  assert.equal(red.status, "RED");

  const orange = await getFloodMonitoring({ ...center, radiusKm: 1, grid: 10 }, providers({
    getHazardAlerts: async () => goodAlerts([{ ...active, severity: "Orange" }]),
  }));
  assert.equal(orange.status, "YELLOW");

  const cyclone = await getFloodMonitoring({ ...center, radiusKm: 1, grid: 10 }, providers({
    getHazardAlerts: async () => goodAlerts([{ ...active, hazardType: "cyclone", severity: "Red" }]),
  }));
  assert.equal(cyclone.status, "GREEN");
});

test("verified flooded-road reports within the radius produce RED; distant points are excluded", async () => {
  const report = {
    id: "report-nearby",
    title: "Verified report",
    lat: center.lat,
    lng: center.lng,
    source: "test field source",
    reportedAt: "2026-10-17T11:00:00.000Z",
  };
  const result = await getFloodMonitoring({ ...center, radiusKm: 1, grid: 10 }, providers({
    getFieldReports: async () => goodReports([], [report, { ...report, id: "road-distant", lat: 13.05 }]),
  }));
  assert.equal(result.status, "RED");
  assert.deepEqual(result.fieldReports.reports.map(({ id }) => id), ["report-nearby"]);
});

test("missing or stale source coverage returns UNKNOWN instead of GREEN", async () => {
  const missingAlerts = await getFloodMonitoring({ ...center, radiusKm: 1, grid: 10 }, providers({
    getHazardAlerts: async () => { throw new Error("feed unavailable"); },
  }));
  assert.equal(missingAlerts.status, "UNKNOWN");
  assert.equal(missingAlerts.alerts.available, false);

  const staleWeather = await getFloodMonitoring({ ...center, radiusKm: 1, grid: 10 }, providers({
    getWeather: async (points) => ({ ...goodWeather(points), stale: true }),
  }));
  assert.equal(staleWeather.status, "UNKNOWN");
});

test("large forecast rainfall triggers documented heavy-rain and flood-risk alert thresholds", async () => {
  const redResult = await getFloodMonitoring({ ...center, radiusKm: 1, grid: 10 }, providers({
    getWeather: async (points) => goodWeather(points, { forecast24Mm: 200, peakForecastHourlyMm: 40 }),
  }));
  assert.equal(redResult.status, "RED");
  assert.equal(redResult.basis, "forecast");
  assert.equal(redResult.weather.coverage.maxForecast24Mm, 200);
  assert.ok(redResult.cells.some((c) => c.status === "RED" && c.color === "#fb7185"));

  const yellowResult = await getFloodMonitoring({ ...center, radiusKm: 1, grid: 10 }, providers({
    getWeather: async (points) => goodWeather(points, { forecast24Mm: 75, peakForecastHourlyMm: 10 }),
  }));
  assert.equal(yellowResult.status, "YELLOW");
  assert.equal(yellowResult.basis, "forecast");
  assert.ok(yellowResult.cells.some((c) => c.status === "YELLOW" && c.color === "#fbbf24"));

  const greenResult = await getFloodMonitoring({ ...center, radiusKm: 1, grid: 10 }, providers({
    getWeather: async (points) => goodWeather(points, { forecast24Mm: 15, peakForecastHourlyMm: 2 }),
  }));
  assert.equal(greenResult.status, "GREEN");
  assert.equal(greenResult.basis, "observation");
  assert.ok(greenResult.cells.every((c) => c.status === "GREEN"));
});

test("monitor output includes spatial grid cells and documented warning thresholds", async () => {
  const result = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, providers());
  assert.equal(result.cells.length, 14 * 14);
  assert.ok(result.cell.size_m > 0);
  assert.ok(result.zoneSummary.pct.GREEN === 100);
  assert.equal(result.thresholds.heavyRain24hMm, 64.5);
  assert.equal(result.thresholds.veryHeavyRain24hMm, 115.6);
  assert.ok(Array.isArray(result.analysisMethods));
  assert.ok(result.analysisMethods.length >= 3);
});

test("malformed Open-Meteo hourly data remains unavailable, never zero-filled", () => {
  const point = _normalizeWeatherLocation({
    current: { time: "2026-10-17T12:00", precipitation: 0 },
    hourly: {
      time: ["2026-10-17T12:00", "2026-10-17T13:00"],
      precipitation: [0, null],
    },
  }, { id: "sample-1", ...center });
  assert.equal(point.currentPrecipitationMm, 0);
  assert.equal(point.past24Mm, null);
  assert.equal(point.forecast24Mm, null);
  assert.equal(point.peakForecastHourlyMm, null);
});

test("monitor validation bounds the requested location, radius, and detail", async () => {
  await assert.rejects(
    getFloodMonitoring({ lat: 91, lng: center.lng, radiusKm: 3, grid: 14 }),
    { status: 400 }
  );
  await assert.rejects(
    getFloodMonitoring({ ...center, radiusKm: 9, grid: 14 }),
    { status: 400 }
  );
  await assert.rejects(
    getFloodMonitoring({ ...center, radiusKm: 3, grid: 12 }),
    { status: 400 }
  );
});
