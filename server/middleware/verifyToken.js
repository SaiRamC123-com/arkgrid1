const { auth } = require("../config/firebaseAdmin");

module.exports = async (req, res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing auth token" });
  }
  try {
    const decoded = await auth.verifyIdToken(header.slice(7));
    req.user = { uid: decoded.uid, email: decoded.email, role: decoded.role || null };
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};