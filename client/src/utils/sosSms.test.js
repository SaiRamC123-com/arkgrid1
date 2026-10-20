import test from "node:test";
import assert from "node:assert/strict";
import { buildSosMessage, buildSosSmsUri, getSmsLengthInfo, normalizePhoneNumber, sendSosSms } from "./sosSms.js";

test("phone numbers are normalized without assuming a country code", () => {
  assert.equal(normalizePhoneNumber(" +44 (20) 1234-5678 "), "+442012345678");
  assert.equal(normalizePhoneNumber("00442012345678"), "+442012345678");
  assert.equal(normalizePhoneNumber("020 1234 5678"), "02012345678");
  assert.equal(normalizePhoneNumber("12-34"), null);
  assert.equal(normalizePhoneNumber("call me 12345678"), null);
});

test("SOS message contains the required reason and fresh location fields", () => {
  const message = buildSosMessage({
    reason: "Medical help",
    location: {
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 18,
      at: "2026-10-15T12:00:00.000Z",
      source: "fresh_device",
    },
  });
  assert.match(message, /^SOS — EMERGENCY ASSISTANCE REQUIRED/m);
  assert.match(message, /Emergency reason: Medical help/);
  assert.match(message, /Latitude: 12\.971600/);
  assert.match(message, /Longitude: 77\.594600/);
  assert.match(message, /Accuracy: 18 meters/);
  assert.match(message, /Location: DEVICE GPS LOCATION/);
  assert.match(message, /Timestamp: 2026-10-15T12:00:00\.000Z/);
  assert.match(message, /https:\/\/www\.google\.com\/maps\?q=12\.9716,77\.5946/);
  assert.match(message, /Location age:/);
});

test("SOS message labels cached coordinates and omits coordinates and links when unavailable", () => {
  const cached = buildSosMessage({
    reason: "Trapped",
    location: { lat: 12.9716, lng: 77.5946, accuracy: 25, at: "2026-10-15T12:00:00.000Z", source: "last_known" },
  });
  assert.match(cached, /Location: LAST KNOWN GPS POSITION — NOT CURRENT/);

  const unavailable = buildSosMessage({ reason: "Not specified", location: null });
  assert.match(unavailable, /Location unavailable/);
  assert.doesNotMatch(unavailable, /Latitude:|Longitude:|Google Maps:/);
});

test("historical GPS SMS identifies the recorded timestamp and age", () => {
  const now = Date.parse("2026-10-15T12:10:00.000Z");
  const message = buildSosMessage({
    reason: "Trapped",
    emergencyId: "emergency-123",
    location: {
      lat: 12.9716,
      lng: 77.5946,
      accuracy: 18,
      at: "2026-10-15T12:05:00.000Z",
      source: "last_recorded",
    },
    now,
  });

  test("manual-only and GPS-plus-landmark messages include bounded, truthful details", () => {
    const manual = buildSosMessage({
      reason: "Trapped",
      emergencyId: "client-incident-123456",
      location: { lat: 12.3, lng: 45.6, source: "manual", at: "2026-10-15T12:00:00.000Z" },
      landmark: "North entrance",
      locality: "Old Town",
      trappedDescription: "Third floor, stairwell blocked",
    });
    assert.match(manual, /Emergency ID: client-incident-123456/);
    assert.match(manual, /MANUALLY ENTERED LOCATION — NOT GPS-VERIFIED/);
    assert.match(manual, /Landmark: North entrance/);
    assert.match(manual, /Locality \/ address: Old Town/);
    assert.match(manual, /Trapped \/ emergency details: Third floor, stairwell blocked/);
    assert.match(manual, /Google Maps: https:\/\/www\.google\.com\/maps\?q=12\.3,45\.6/);

    const gps = buildSosMessage({
      reason: "Medical help",
      location: { lat: 12.3, lng: 45.6, accuracy: 8, source: "fresh_device", at: "2026-10-15T12:00:00.000Z" },
      landmark: "A".repeat(100),
    });
    assert.match(gps, /Location: DEVICE GPS LOCATION/);
    assert.match(gps, /Accuracy: 8 meters/);
    assert.match(gps, new RegExp(`Landmark: ${"A".repeat(80)}(?:\\n|$)`));
    assert.doesNotMatch(gps, /A{81}/);
  });

  test("SMS segment estimate accounts for Unicode and multipart message length", () => {
    assert.deepEqual(getSmsLengthInfo("SOS"), { encoding: "GSM-7", characters: 3, segments: 1 });
    assert.deepEqual(getSmsLengthInfo("SOS — help"), { encoding: "Unicode", characters: 10, segments: 1 });
    const longMessage = "a".repeat(140);
    assert.deepEqual(getSmsLengthInfo(longMessage), { encoding: "GSM-7", characters: 140, segments: 1 });
    assert.equal(getSmsLengthInfo("a".repeat(161)).segments, 2);
    assert.equal(getSmsLengthInfo("—".repeat(71)).segments, 2);
  });

  assert.match(message, /Emergency ID: emergency-123/);
  assert.match(message, /Location: LAST RECORDED GPS LOCATION — NOT CURRENT/);
  assert.match(message, /Timestamp: 2026-10-15T12:05:00\.000Z/);
  assert.match(message, /Location age: 5 minutes 0 seconds/);
});

test("SMS action creates a prefilled composer URI and does not claim delivery", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { href: "" } };
  try {
    const text = "ARKGRID SOS\nCoordinates: 12.3, 45.6";
    assert.equal(sendSosSms({ numbers: ["+442012345678"], text, userAgent: "Android" }), true);
    assert.match(globalThis.window.location.href, /^sms:\+442012345678\?body=/);
    assert.equal(decodeURIComponent(globalThis.window.location.href.split("body=")[1]), text);
    assert.equal(sendSosSms({ numbers: ["+442012345678"], text, userAgent: "iPhone" }), true);
    assert.match(globalThis.window.location.href, /^sms:\+442012345678&body=/);
    assert.equal(sendSosSms({ numbers: [], text, userAgent: "Android" }), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("SMS URIs use platform separators and encode the body once", () => {
  const message = "SOS — EMERGENCY ASSISTANCE REQUIRED\nMaps: https://www.google.com/maps?q=12.3,45.6";
  const androidUri = buildSosSmsUri({ numbers: ["+44 (20) 1234-5678"], text: message, userAgent: "Android" });
  const iosUri = buildSosSmsUri({ numbers: ["+44 (20) 1234-5678"], text: message, userAgent: "iPhone" });
  assert.match(androidUri, /^sms:\+442012345678\?body=/);
  assert.match(iosUri, /^sms:\+442012345678&body=/);
  assert.equal(decodeURIComponent(androidUri.split("body=")[1]), message);
  assert.equal(decodeURIComponent(iosUri.split("body=")[1]), message);
  assert.equal(buildSosSmsUri({ numbers: ["invalid"], text: message }), null);
});
