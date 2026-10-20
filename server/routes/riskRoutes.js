const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const verifyToken = require("../middleware/verifyToken");
const c = require("../controllers/riskController");

router.use(verifyToken);
const limitOptions = {
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user.uid,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many analyses. Try again in a minute." },
};

router.post("/monitor", rateLimit(limitOptions), c.monitor);
router.use(rateLimit(limitOptions));
router.post("/", c.assess);
router.get("/model", c.model);

module.exports = router;