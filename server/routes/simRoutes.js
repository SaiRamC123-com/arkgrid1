const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const { run } = require("../controllers/simController");

router.use(verifyToken, roleGuard("responder", "commander"));
router.use(rateLimit({ windowMs: 60 * 1000, max: 8, keyGenerator: (req) => req.user.uid, message: { message: "Too many simulations. Try again in a minute." } }));
router.post("/", run);

module.exports = router;