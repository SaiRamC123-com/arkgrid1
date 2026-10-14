const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const verifyToken = require("../middleware/verifyToken");
const { chat } = require("../controllers/chatController");

router.use(verifyToken);
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    keyGenerator: (req) => req.user.uid,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Slow down a little. Try again in a minute." },
  })
);

router.post("/", chat);

module.exports = router;