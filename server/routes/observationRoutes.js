const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const observations = require("../controllers/observationController");
const hazardObservations = require("../controllers/hazardObservationController");

router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many observation refreshes. Try again shortly." },
}));

router.get("/earthquakes", observations.listEarthquakes);
router.get("/hazards", hazardObservations.listHazardAlerts);

module.exports = router;
