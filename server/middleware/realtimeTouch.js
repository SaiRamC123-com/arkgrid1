const { invalidate } = require("../services/realtime");

const TOPICS = {
  "/api/sos": "sos", "/api/reports": "reports", "/api/shelters": "shelters", "/api/roads": "roads",
  "/api/incidents": "incidents", "/api/teams": "teams", "/api/infra": "infra",
  "/api/priority": "priority", "/api/search": "search",
"/api/logistics": "shelters", "/api/safety": "safety", "/api/advisories": "advisories",

};

// Every successful write to a watched resource tells the dashboards to refresh,
// so existing controllers need no changes.
module.exports = (req, res, next) => {
  if (req.method === "GET") return next();
  res.on("finish", () => {
    if (res.statusCode >= 400 || req.originalUrl.includes("/me/location")) return;
    const prefix = Object.keys(TOPICS).find((p) => req.originalUrl.startsWith(p));
    if (prefix) invalidate(TOPICS[prefix]);
  });
  next();
};