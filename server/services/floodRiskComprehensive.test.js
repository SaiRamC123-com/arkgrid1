const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getFloodMonitoring,
  _buildSamplePoints,
  _buildGridCells,
  _distanceMeters,
  _normalizeWeatherLocation,
  THRESHOLDS,
} = require("./floodMonitoringService");

const center = { lat: 12.9716, lng: 77.5946 };

function mockWeather(points, overrides = {}) {
  return {
    source: "Open-Meteo Forecast API (test fixture)",
    retrievedAt: new Date().toISOString(),
    stale: false,
    points: points.map((p, idx) => ({
      ...p,
      currentPrecipitationMm: 0,
      past24Mm: 5,
      forecast24Mm: 10,
      peakForecastHourlyMm: 2,
      dataQuality: "available",
      ...(typeof overrides === "function" ? overrides(p, idx) : overrides),
    })),
  };
}

function mockAlerts(events = [], overrides = {}) {
  return {
    events,
    source: "Global Disaster Alert and Coordination System (GDACS)",
    retrievedAt: new Date().toISOString(),
    stale: false,
    ...overrides,
  };
}

function mockReports(reports = [], roads = [], sourcesOverride = {}) {
  return {
    reports,
    roads,
    sources: {
      reports: { available: true, source: "ArkGrid verified user reports", retrievedAt: new Date().toISOString() },
      roads: { available: true, source: "ArkGrid verified road reports", retrievedAt: new Date().toISOString() },
      ...sourcesOverride,
    },
  };
}

// 1 & 2. ML service offline fallback vs online
test("ML service offline: real-data monitoring continues and provides complete zone cells and methods", async () => {
  const result = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => mockWeather(pts),
    getHazardAlerts: async () => mockAlerts(),
    getFieldReports: async () => mockReports(),
  });
  assert.equal(result.status, "GREEN");
  assert.equal(result.cells.length, 196);
  assert.ok(result.analysisMethods.some((m) => m.id === "ml_susceptibility" && m.available === false));
  assert.ok(result.analysisMethods.some((m) => m.id === "weather_screen" && m.available === true));
  assert.ok(result.cells.every((c) => c.status === "GREEN" && c.color === "#4ade80"));
});

// 3 & 4. Weather provider availability and honest unavailable state
test("Weather provider unavailable: returns UNKNOWN without fabricated results", async () => {
  const result = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async () => { throw new Error("Connection timeout"); },
    getHazardAlerts: async () => mockAlerts(),
    getFieldReports: async () => mockReports(),
  });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.basis, "insufficient_data");
  assert.equal(result.weather.available, false);
  assert.ok(result.cells.every((c) => c.status === "UNKNOWN" && c.color === "#94a3b8"));
  assert.ok(result.zoneSummary.pct.UNKNOWN === 100);
});

// 5 & 6. Official flood alerts (Red/Orange vs None)
test("Official flood alerts: active GDACS Red produces RED, Orange produces YELLOW, none produces GREEN", async () => {
  const redAlert = {
    id: "gdacs-FL-99",
    hazardType: "flood",
    status: "Ongoing (GDACS)",
    severity: "Red",
    latitude: center.lat,
    longitude: center.lng,
    title: "Major River Inundation",
    time: new Date().toISOString(),
  };

  const redResult = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => mockWeather(pts),
    getHazardAlerts: async () => mockAlerts([redAlert]),
    getFieldReports: async () => mockReports(),
  });
  assert.equal(redResult.status, "RED");
  assert.equal(redResult.basis, "official_alert");

  const orangeAlert = { ...redAlert, severity: "Orange", title: "River Watch" };
  const orangeResult = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => mockWeather(pts),
    getHazardAlerts: async () => mockAlerts([orangeAlert]),
    getFieldReports: async () => mockReports(),
  });
  assert.equal(orangeResult.status, "YELLOW");
  assert.equal(orangeResult.basis, "official_alert");

  const noAlertsResult = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => mockWeather(pts),
    getHazardAlerts: async () => mockAlerts([]),
    getFieldReports: async () => mockReports(),
  });
  assert.equal(noAlertsResult.status, "GREEN");
});

// 7. Missing or malformed rainfall values
test("Missing or malformed rainfall: incomplete samples produce UNKNOWN rather than fabricated green", async () => {
  const result = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => mockWeather(pts, { forecast24Mm: null, peakForecastHourlyMm: null, dataQuality: "incomplete" }),
    getHazardAlerts: async () => mockAlerts(),
    getFieldReports: async () => mockReports(),
  });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.weather.coverage.complete, false);
});

// 8 & 9. Valid selected coordinates and different locations
test("Supports different valid coordinate points globally", async () => {
  const locations = [
    { name: "Bangalore", lat: 12.9716, lng: 77.5946 },
    { name: "Mumbai", lat: 19.0760, lng: 72.8777 },
    { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
  ];
  for (const loc of locations) {
    const res = await getFloodMonitoring({ lat: loc.lat, lng: loc.lng, radiusKm: 2, grid: 10 }, {
      getWeather: async (pts) => mockWeather(pts),
      getHazardAlerts: async () => mockAlerts(),
      getFieldReports: async () => mockReports(),
    });
    assert.equal(res.center.lat, loc.lat);
    assert.equal(res.center.lng, loc.lng);
    assert.equal(res.status, "GREEN");
  }
});

// 10. Different area radii (1 km, 3 km, 8 km)
test("Supports different area radii (1 to 8 km)", async () => {
  for (const radiusKm of [1, 3, 5, 8]) {
    const res = await getFloodMonitoring({ ...center, radiusKm, grid: 10 }, {
      getWeather: async (pts) => mockWeather(pts),
      getHazardAlerts: async () => mockAlerts(),
      getFieldReports: async () => mockReports(),
    });
    assert.equal(res.radiusKm, radiusKm);
    assert.ok(res.cell.size_m > 0);
  }
});

// 11. Fast, Balanced, Detailed modes (grid: 10, 14, 20)
test("Detail modes Fast (10), Balanced (14), Detailed (20) scale spatial sampling without fabrication", async () => {
  const modes = [
    { grid: 10, expectedSampleCount: 5, expectedCellCount: 100 },
    { grid: 14, expectedSampleCount: 13, expectedCellCount: 196 },
    { grid: 20, expectedSampleCount: 29, expectedCellCount: 400 },
  ];
  for (const m of modes) {
    const res = await getFloodMonitoring({ ...center, radiusKm: 3, grid: m.grid }, {
      getWeather: async (pts) => mockWeather(pts),
      getHazardAlerts: async () => mockAlerts(),
      getFieldReports: async () => mockReports(),
    });
    assert.equal(res.sampleCount, m.expectedSampleCount);
    assert.equal(res.cells.length, m.expectedCellCount);
  }
});

// 12. API timeout and error resilience
test("Provider timeouts are handled gracefully without crashing other services", async () => {
  const res = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => mockWeather(pts),
    getHazardAlerts: async () => { throw new Error("GDACS timeout"); },
    getFieldReports: async () => mockReports(),
  });
  assert.equal(res.status, "UNKNOWN");
  assert.equal(res.alerts.available, false);
  assert.equal(res.weather.available, true); // weather still parsed and returned
});

// 13. Cached data with old timestamp maintains stale flag
test("Cached stale data retains its original timestamp and stale flag", async () => {
  const res = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => ({ ...mockWeather(pts), stale: true, retrievedAt: "2026-10-18T00:00:00.000Z" }),
    getHazardAlerts: async () => mockAlerts(),
    getFieldReports: async () => mockReports(),
  });
  assert.equal(res.status, "UNKNOWN");
  assert.equal(res.weather.stale, true);
  assert.equal(res.weather.retrievedAt, "2026-10-18T00:00:00.000Z");
});

// 14. High-risk result supported by actual input data
test("Documented IMD heavy rainfall thresholds trigger YELLOW and RED risk zones", async () => {
  // Heavy rain watch (≥64.5 mm / 24h)
  const yellowRes = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => mockWeather(pts, { forecast24Mm: 70 }),
    getHazardAlerts: async () => mockAlerts(),
    getFieldReports: async () => mockReports(),
  });
  assert.equal(yellowRes.status, "YELLOW");
  assert.equal(yellowRes.basis, "forecast");

  // Extreme rainfall (≥115.6 mm / 24h)
  const redRes = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => mockWeather(pts, { forecast24Mm: 140 }),
    getHazardAlerts: async () => mockAlerts(),
    getFieldReports: async () => mockReports(),
  });
  assert.equal(redRes.status, "RED");
  assert.equal(redRes.basis, "forecast");
});

// 15. Insufficient-data case returning UNKNOWN rather than green
test("Field reports failure causes UNKNOWN status, never green", async () => {
  const res = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => mockWeather(pts),
    getHazardAlerts: async () => mockAlerts(),
    getFieldReports: async () => ({
      reports: [],
      roads: [],
      sources: {
        reports: { available: false, source: "failed", retrievedAt: null },
        roads: { available: false, source: "failed", retrievedAt: null },
      },
    }),
  });
  assert.equal(res.status, "UNKNOWN");
});

// 16. Confirmed flood observation produces RED and distinguishes from forecast
test("Confirmed on-the-ground flooded road report produces RED with observation basis", async () => {
  const verifiedRoad = {
    id: "road-1",
    title: "Flooded MG Road Underpass",
    lat: center.lat + 0.001,
    lng: center.lng + 0.001,
    source: "ArkGrid verified road report",
    reportedAt: new Date().toISOString(),
  };

  const res = await getFloodMonitoring({ ...center, radiusKm: 3, grid: 14 }, {
    getWeather: async (pts) => mockWeather(pts),
    getHazardAlerts: async () => mockAlerts(),
    getFieldReports: async () => mockReports([], [verifiedRoad]),
  });
  assert.equal(res.status, "RED");
  assert.equal(res.basis, "observation");
  assert.ok(res.cells.some((c) => c.status === "RED" && c.basis === "observation"));
  assert.ok(res.fieldReports.reports.some((r) => r.id === "road-1"));
});
