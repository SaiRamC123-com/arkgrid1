const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSosDetails, parseSosLocation } = require("./sosPayload");

test("SOS detail payloads are bounded, sanitized, and require explicit confirmation", () => {
  const details = parseSosDetails({
    landmark: `  ${"L".repeat(100)}\nentrance `,
    locality: " Old Town ",
    trappedDescription: "Floor 3\u0000 stairwell blocked",
    locationDetailsConfirmed: true,
  });
  assert.equal(details.landmark.length, 80);
  assert.equal(details.locality, "Old Town");
  assert.equal(details.trappedDescription, "Floor 3 stairwell blocked");
  assert.equal(details.locationDetailsConfirmed, true);
  assert.equal(parseSosDetails({ landmark: "Unconfirmed" }).locationDetailsConfirmed, false);
  assert.equal(parseSosDetails({}), null);
});

test("SOS coordinates accept complete valid pairs and reject partial or invalid pairs", () => {
  assert.deepEqual(parseSosLocation({
    lat: "12.5",
    lng: "45.25",
    accuracy: 8.2,
    locationSource: "manual",
  }), { lat: 12.5, lng: 45.25, accuracy: 8, source: "manual" });
  assert.equal(parseSosLocation({
    lat: 12.5,
    lng: 45.25,
    locationSource: "last_recorded",
  }).source, "last_recorded");
  assert.equal(parseSosLocation({}), null);
  assert.throws(() => parseSosLocation({ lat: 12.5 }), { status: 400 });
  assert.throws(() => parseSosLocation({ lat: 91, lng: 45 }), { status: 400 });
});
