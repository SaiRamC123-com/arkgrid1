const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/shelterController");

router.use(verifyToken);

router.get("/nearby", c.nearby);
router.get("/", c.list); // every signed-in role

const manage = roleGuard("responder", "commander");
router.post("/", manage, c.create);
router.patch("/:id", manage, c.update);
router.post("/:id/occupancy", manage, c.adjustOccupancy);

router.post("/seed", roleGuard("commander"), c.seedDemo);
router.delete("/seed", roleGuard("commander"), c.clearDemo);
router.delete("/:id", roleGuard("commander"), c.remove);

module.exports = router;