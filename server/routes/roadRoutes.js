const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const c = require("../controllers/roadController");

router.use(verifyToken);

router.get("/", c.list);
router.post("/", c.create);
router.post("/:id/confirm", c.confirm);
router.patch("/:id", c.update);
router.delete("/:id", c.remove);

module.exports = router;