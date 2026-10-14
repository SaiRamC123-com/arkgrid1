const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/logisticsController");

router.use(verifyToken, roleGuard("responder", "commander"));

router.get("/", c.get);
router.put("/inventory/:id", c.setInventory);
router.put("/config", roleGuard("commander"), c.saveConfig);
router.delete("/config", roleGuard("commander"), c.resetConfig);
router.post("/demo", roleGuard("commander"), c.seedDemo);
router.delete("/demo", roleGuard("commander"), c.clearDemo);

module.exports = router;