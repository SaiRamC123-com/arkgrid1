export function normalizePhoneNumber(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/[A-Za-z]/.test(raw)) return null;
  if (!/^[+\d\s().-]+$/.test(raw)) return null;

  let compact = raw.replace(/[\s().-]/g, "");
  let hasCountryCode = compact.startsWith("+");
  if (compact.startsWith("00")) {
    compact = compact.slice(2);
    hasCountryCode = true;
  }
  if (compact.includes("+")) {
    if (compact.indexOf("+") !== 0) return null;
    compact = compact.slice(1);
    hasCountryCode = true;
  }
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;

  return hasCountryCode ? `+${digits}` : digits;
}

function cleanSosDetail(value, maxLength) {
  if (typeof value !== "string") return "";
  const normalized = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
  return normalized.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const GSM_BASIC_CHARACTERS = new Set(Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"));
const GSM_EXTENSION_CHARACTERS = new Set(["^", "{", "}", "\\", "[", "~", "]", "|", "€"]);

export function buildSosMessage({
  reason,
  location,
  emergencyId,
  ageMs,
  landmark,
  locality,
  trappedDescription,
  now = Date.now(),
}) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const accuracy = Number(location?.accuracy);
  const hasCoordinates = Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  const date = location?.at ? new Date(location.at) : null;
  const timestamp = date && !Number.isNaN(date.getTime()) ? date.toISOString() : "Unavailable";
  const locationStatus = location?.source === "fresh_device"
      ? "DEVICE GPS LOCATION"
    : location?.source === "last_recorded"
      ? "LAST RECORDED GPS LOCATION — NOT CURRENT"
    : location?.source === "last_known"
        ? "LAST KNOWN GPS POSITION — NOT CURRENT"
      : location?.source === "manual"
          ? "MANUALLY ENTERED LOCATION — NOT GPS-VERIFIED"
        : "LOCATION SOURCE UNAVAILABLE";
  const details = [
      ["Landmark", cleanSosDetail(landmark, 80)],
      ["Locality / address", cleanSosDetail(locality, 100)],
      ["Trapped / emergency details", cleanSosDetail(trappedDescription, 140)],
  ].filter(([, value]) => value);
  const lines = [
    "SOS — EMERGENCY ASSISTANCE REQUIRED",
    "ArkGrid Disaster Response",
    `Emergency ID: ${emergencyId || "Not assigned"}`,
    `Emergency reason: ${reason || "Not specified"}`,
  ];

  if (hasCoordinates) {
    const selectedAgeMs = Number.isFinite(ageMs)
      ? ageMs
      : location?.at
        ? Math.max(0, now - new Date(location.at).getTime())
        : null;
    lines.push(
      `Location: ${locationStatus}`,
      `Latitude: ${lat.toFixed(6)}`,
      `Longitude: ${lng.toFixed(6)}`,
      `Accuracy: ${Number.isFinite(accuracy) && accuracy >= 0 ? `${Math.round(accuracy)} meters` : "Not reported"}`,
      `Timestamp: ${timestamp}`,
      `Location age: ${Number.isFinite(selectedAgeMs)
        ? `${Math.floor(selectedAgeMs / 60000)} minutes ${Math.floor((selectedAgeMs % 60000) / 1000)} seconds`
        : "Unavailable"}`,
      `Google Maps: https://www.google.com/maps?q=${lat},${lng}`
    );
  } else {
    lines.push("Location unavailable", "Accuracy: Not reported", `Timestamp: ${timestamp}`);
  }
  if (details.length) {
    lines.push("User-provided location details (not independently verified):");
    details.forEach(([label, value]) => lines.push(`${label}: ${value}`));
  }
  return lines.join("\n");
}

export function getSmsLengthInfo(text) {
  const characters = Array.from(text);
  const gsm = characters.every((character) => GSM_BASIC_CHARACTERS.has(character) || GSM_EXTENSION_CHARACTERS.has(character));
  const units = gsm
    ? characters.reduce((count, character) => count + (GSM_EXTENSION_CHARACTERS.has(character) ? 2 : 1), 0)
    : text.length;
  const singleLimit = gsm ? 160 : 70;
  const multipartLimit = gsm ? 153 : 67;
  return {
    encoding: gsm ? "GSM-7" : "Unicode",
    characters: text.length,
    segments: units <= singleLimit ? 1 : Math.ceil(units / multipartLimit),
  };
}

export function buildSosSmsUri({ numbers = [], text, userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent }) {
  const recipients = (Array.isArray(numbers) ? numbers : [numbers])
    .map(normalizePhoneNumber)
    .filter(Boolean);
  if (!recipients.length || typeof text !== "string" || !text.trim()) return null;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  const separator = isAppleMobile ? "&" : "?";
  return `sms:${recipients.join(",")}${separator}body=${encodeURIComponent(text)}`;
}

export function sendSosSms({ numbers = [], text, userAgent }) {
  if (typeof window === "undefined" || !window.location) return false;
  const uri = buildSosSmsUri({ numbers, text, userAgent });
  if (!uri) return false;
  try {
    logSosSms("SMS URI constructed successfully", { recipientCount: Array.isArray(numbers) ? numbers.length : 1 });
    window.location.href = uri;
    logSosSms("external SMS application launch attempted");
    return true;
  } catch {
    return false;
  }
}

function logSosSms(event, details = {}) {
  if (import.meta.env?.DEV) console.debug(`[sos] ${event}`, details);
}
