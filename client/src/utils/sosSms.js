export function sendSosSms({ numbers = [], lat, lng, name, message = "" }) {
  const loc = lat != null && lng != null
    ? `Location: https://maps.google.com/?q=${lat},${lng}`
    : "Location unavailable";
  const text = `SOS from ${name}. I need help. ${loc}${message ? ` Note: ${message}` : ""}`;
  const sep = /iPhone|iPad/i.test(navigator.userAgent) ? "&" : "?";
  window.location.href = `sms:${numbers.join(",")}${sep}body=${encodeURIComponent(text)}`;
}