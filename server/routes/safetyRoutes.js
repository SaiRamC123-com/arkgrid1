const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/safetyController");

router.use(verifyToken, roleGuard("responder", "commander"));
router.get("/scenario", c.get);
router.post("/scenario", roleGuard("commander"), c.publish);
router.delete("/scenario", roleGuard("commander"), c.clear);

module.exports = router;