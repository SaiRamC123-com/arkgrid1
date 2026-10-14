const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/incidentController");

router.use(verifyToken, roleGuard("responder", "commander"));

router.get("/", c.list);
router.post("/recluster", roleGuard("commander"), c.recluster);
router.post("/demo", roleGuard("commander"), c.seedDemo);
router.delete("/demo", roleGuard("commander"), c.clearDemo);
router.get("/:id", c.get);
router.patch("/:id/ops", c.setOps);

module.exports = router;