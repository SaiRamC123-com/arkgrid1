const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const weather = require("../controllers/weatherController");

router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many weather requests. Please wait before refreshing." },
}));

router.get("/heat-grid", weather.heatGrid);

module.exports = router;
