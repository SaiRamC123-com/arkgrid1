const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const roleGuard = require("../middleware/roleGuard");
const c = require("../controllers/advisoryController");

router.use(verifyToken);
router.get("/", c.list); // every role (citizens get area-matched advisories)
router.post("/", roleGuard("commander"), c.create);
router.delete("/:id", roleGuard("commander"), c.withdraw);

module.exports = router;