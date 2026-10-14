const { Server } = require("socket.io");
const { auth } = require("../config/firebaseAdmin");
const { isOriginAllowed } = require("../utils/cors");

let io = null;
let version = 0; // bumps on every change, so cached snapshots know they are stale
let pending = new Set();
let timer = null;

exports.init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
      credentials: true,
    },
    pingInterval: 20000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("unauthorized"));
      const d = await auth.verifyIdToken(token);
      socket.data.user = { uid: d.uid, role: d.role || null, exp: d.exp };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { uid, role, exp } = socket.data.user;
    socket.join(`user:${uid}`);
    if (role === "responder" || role === "commander") socket.join("ops");
    // Tokens expire after ~1 h: drop the socket then, the client reconnects with a fresh token
    const t = setTimeout(() => socket.disconnect(true), Math.max(1000, exp * 1000 - Date.now()));
    socket.on("disconnect", () => clearTimeout(t));
  });
  return io;
};

exports.version = () => version;

// Coalesces bursts: many writes inside 250 ms produce one broadcast
exports.invalidate = (topic) => {
  version++;
  pending.add(topic);
  if (timer) return;
  timer = setTimeout(() => {
    io?.to("ops").emit("ops:invalidate", { topics: [...pending] });
    pending = new Set();
    timer = null;
  }, 250);
};

exports.emitOps = (event, payload) => io?.to("ops").emit(event, payload);
exports.emitUser = (uid, event, payload) => io?.to(`user:${uid}`).emit(event, payload);