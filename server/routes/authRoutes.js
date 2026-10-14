const router = require("express").Router();
const verifyToken = require("../middleware/verifyToken");
const { saveProfile, getMe } = require("../controllers/authController");

router.post("/profile", verifyToken, saveProfile);
router.get("/me", verifyToken, getMe);

module.exports = router;