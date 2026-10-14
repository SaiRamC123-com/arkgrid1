require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("./config/firebaseAdmin");
const errorHandler = require("./middleware/errorHandler");
const realtime = require("./services/realtime");
const realtimeTouch = require("./middleware/realtimeTouch");

const app = express();
app.set("trust proxy", 1);

const { corsMiddlewareOptions } = require("./utils/cors");

app.use(helmet());
app.use(cors(corsMiddlewareOptions));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 300 }));
app.use("/api", realtimeTouch);

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", service: "ArkGrid API", time: new Date().toISOString() })
);

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/family", require("./routes/familyRoutes"));
app.use("/api/sos", require("./routes/sosRoutes"));
app.use("/api/shelters", require("./routes/shelterRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/roads", require("./routes/roadRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/incidents", require("./routes/incidentRoutes"));
app.use("/api/risk", require("./routes/riskRoutes"));
app.use("/api/teams", require("./routes/teamRoutes"));
app.use("/api/infra", require("./routes/infraRoutes"));
app.use("/api/ops", require("./routes/opsRoutes"));
app.use("/api/priority", require("./routes/priorityRoutes"));
app.use("/api/search", require("./routes/searchRoutes"));
app.use("/api/sim", require("./routes/simRoutes"));
app.use("/api/safety", require("./routes/safetyRoutes"));
app.use("/api/advisories", require("./routes/advisoryRoutes"));
app.use("/api/logistics", require("./routes/logisticsRoutes"));
if (process.env.NODE_ENV !== "production") {
  app.get("/api/debug/reports", (req, res) => {
    const ctrl = require("./controllers/reportController");
    const fakeRes = { status() { return this; }, json: (d) => res.json({ ok: true, count: d.reports?.length }) };
    ctrl.list({ user: { uid: "debug", role: "citizen" }, query: {} }, fakeRes, (err) =>
      res.status(500).json({ ok: false, message: err.message, code: err.code, stack: String(err.stack).split("\n").slice(0, 6) })
    );
  });
}
app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
realtime.init(server);

server.listen(PORT, () => {
  console.log(`ArkGrid API running on port ${PORT}`);
  require("./services/clusterService").startClusterJob();
});