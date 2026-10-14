const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/searchController");

router.use(verifyToken, roleGuard("responder", "commander"));

router.get("/cases", c.list);
router.post("/cases", c.create);
router.post("/demo", roleGuard("commander"), c.seedDemo);
router.delete("/demo", roleGuard("commander"), c.clearDemo);
router.get("/cases/:id/zone", c.zone);
router.patch("/cases/:id", c.update);
router.delete("/cases/:id", roleGuard("commander"), c.remove);

module.exports = router;