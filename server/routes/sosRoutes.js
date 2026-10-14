const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/sosController");

router.use(verifyToken);

router.get("/active", roleGuard("responder", "commander"), c.listActive);

router.get("/mine", roleGuard("citizen"), c.listMine);
router.get("/medical", roleGuard("citizen"), c.getMedical);
router.put("/medical", roleGuard("citizen"), c.saveMedical);
router.post("/", roleGuard("citizen"), c.createSOS);
router.post("/:id/ping", roleGuard("citizen"), c.pingSOS);
router.post("/:id/resolve", roleGuard("citizen"), c.resolveSOS);

module.exports = router;