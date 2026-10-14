const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/opsController");

router.use(verifyToken, roleGuard("responder", "commander"));

router.get("/overview", c.overview);
router.post("/demo", roleGuard("commander"), c.seedDemo);
router.delete("/demo", roleGuard("commander"), c.clearDemo);

module.exports = router;