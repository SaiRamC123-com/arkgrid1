const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/infraController");

router.use(verifyToken, roleGuard("responder", "commander"));

router.post("/", roleGuard("commander"), c.create);
router.patch("/:id", c.update);
router.delete("/:id", roleGuard("commander"), c.remove);

module.exports = router;