import { auth } from "../firebase";

export async function streamChat({ messages, location, signal, onToken }) {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, location }),
    signal,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `ArkBot error (${res.status})`);
  }
  if (!res.body) return onToken(await res.text());

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(dec.decode(value, { stream: true }));
  }
}