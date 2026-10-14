import { io } from "socket.io-client";
import { auth } from "../firebase";

let socket = null;
let refs = 0;

// One shared connection. The token is fetched fresh on every (re)connect.
export function acquireSocket() {
  if (!socket) {
    const rawUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
    socket = io(rawUrl || window.location.origin, {
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 8000,
      auth: async (cb) => {
        try {
          const user = auth.currentUser;
          cb({ token: user ? await user.getIdToken() : null });
        } catch {
          cb({});
        }
      },
    });
  }
  refs++;
  return socket;
}

export function releaseSocket() {
  refs = Math.max(0, refs - 1);
  if (refs === 0 && socket) {
    socket.disconnect();
    socket = null;
  }
}