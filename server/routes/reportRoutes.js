const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const upload = require("../middleware/upload");
const c = require("../controllers/reportController");

router.use(verifyToken);

router.get("/", c.list);
router.post("/", upload("photo"), c.create);
router.post("/:id/confirm", c.confirm);
router.patch("/:id/status", c.setStatus);

module.exports = router;