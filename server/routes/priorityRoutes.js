const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/priorityController");

router.use(verifyToken, roleGuard("responder", "commander"));

router.get("/", c.get);
router.put("/weights", roleGuard("commander"), c.saveWeights);
router.delete("/weights", roleGuard("commander"), c.resetWeights);
router.post("/demo", roleGuard("commander"), c.seedDemo);
router.delete("/demo", roleGuard("commander"), c.clearDemo);
router.patch("/:id/flow", c.setFlow);

module.exports = router;