const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/familyController");

router.use(verifyToken, roleGuard("citizen"));

router.get("/", c.listFamilies);
router.post("/", c.createFamily);
router.post("/join", c.joinFamily);
router.post("/status", c.updateStatus);
router.post("/location", c.updateLocation);
router.post("/:id/leave", c.leaveFamily);
router.get("/:id/activity", c.getActivity);
router.post("/:id/zones", c.addZone);
router.delete("/:id/zones/:zoneId", c.removeZone);

module.exports = router;