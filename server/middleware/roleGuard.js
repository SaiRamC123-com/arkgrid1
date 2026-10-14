module.exports = (...allowed) => (req, res, next) => {
  if (!req.user?.role || !allowed.includes(req.user.role)) {
    return res.status(403).json({ message: "You do not have access to this resource" });
  }
  next();
};