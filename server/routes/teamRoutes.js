const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/teamController");

router.use(verifyToken, roleGuard("responder", "commander"));

router.post("/", roleGuard("commander"), c.create);
router.post("/leave", c.leave);
router.post("/me/location", c.location);
router.patch("/:id", c.update);
router.delete("/:id", roleGuard("commander"), c.remove);
router.post("/:id/join", c.join);
router.post("/:id/assign", roleGuard("commander"), c.assign);

module.exports = router;