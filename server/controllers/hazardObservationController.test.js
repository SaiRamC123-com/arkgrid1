const test = require("node:test");
const assert = require("node:assert/strict");
const { _filterWindow, _normalizeFeature, _dedupeEvents } = require("../services/gdacs");

test("GDACS flood and cyclone features retain their official type, dates, source, severity, and status", () => {
  const now = Date.parse("2026-10-17T12:00:00.000Z");
  const flood = _normalizeFeature({
    id: "1104230",
    geometry: { type: "Point", coordinates: [28.9986, 41.1157] },
    properties: {
      eventtype: "FL",
      eventid: 1104230,
      episodeid: 2,
      name: "Flood in Türkiye",
      description: "Flood in Türkiye",
      alertlevel: "Orange",
      iscurrent: 1,
      fromdate: "2026-10-12T01:00:00",
      todate: "2026-10-18T01:00:00",
      datemodified: "2026-10-16T07:45:43",
      country: "Türkiye",
      source: "GLOFAS",
      url: { report: "https://www.gdacs.org/report.aspx?id=1104230" },
    },
  }, now);

  assert.equal(flood.hazardType, "flood");
  assert.equal(flood.title, "Flood in Türkiye");
  assert.equal(flood.latitude, 41.1157);
  assert.equal(flood.longitude, 28.9986);
  assert.equal(flood.severity, "Orange");
  assert.equal(flood.status, "Ongoing (GDACS)");
  assert.equal(flood.source, "GLOFAS");
  assert.equal(flood.time, "2026-10-12T01:00:00.000Z");
  assert.equal(flood.expiresAt, "2026-10-18T01:00:00.000Z");
  assert.equal(flood.updated, "2026-10-16T07:45:43.000Z");
  assert.equal(flood.url, "https://www.gdacs.org/report.aspx?id=1104230");
});

test("GDACS normalization rejects unsupported types and malformed coordinates or time", () => {
  const feature = {
    geometry: { type: "Point", coordinates: [20, 10] },
    properties: {
      eventtype: "FL",
      eventid: 1,
      fromdate: "2026-10-17T10:00:00",
    },
  };
  assert.equal(_normalizeFeature({ ...feature, properties: { ...feature.properties, eventtype: "EQ" } }), null);
  assert.equal(_normalizeFeature({ ...feature, geometry: { coordinates: [200, 10] } }), null);
  assert.equal(_normalizeFeature({ ...feature, properties: { ...feature.properties, fromdate: "invalid" } }), null);
});

test("GDACS keeps ongoing events but filters ended events to the exact requested window", () => {
  const now = Date.parse("2026-10-17T12:00:00.000Z");
  const events = [
    { time: "2026-10-17T11:00:00.000Z", status: "Recent event (not marked current by GDACS)" },
    { time: "2026-10-16T11:00:00.000Z", status: "Recent event (not marked current by GDACS)" },
    { time: "2026-10-10T11:00:00.000Z", status: "Ongoing (GDACS)" },
    { time: "2026-10-17T13:00:00.000Z", status: "Recent event (not marked current by GDACS)" },
  ];

  assert.deepEqual(_filterWindow(events, 24, now), [events[0], events[2]]);
});

test("GDACS does not mark expired provider-current events as ongoing", () => {
  const now = Date.parse("2026-10-17T12:00:00.000Z");
  const event = _normalizeFeature({
    geometry: { type: "Point", coordinates: [77.5, 12.9] },
    properties: {
      eventtype: "FL",
      eventid: 2,
      alertlevel: "Red",
      iscurrent: "true",
      fromdate: "2026-10-17T00:00:00",
      todate: "2026-10-17T11:59:00",
    },
  }, now);
  assert.equal(event.status, "Recent event (not marked current by GDACS)");
  assert.deepEqual(_filterWindow([event], 24, now), [event]);
});

test("GDACS duplicate event IDs are represented once", () => {
  const event = { id: "gdacs-FL-1-1", title: "Flood" };
  assert.deepEqual(_dedupeEvents([event, { ...event }, { id: "other", title: "Other" }]), [
    event,
    { id: "other", title: "Other" },
  ]);
});
