module.exports = (err, req, res, next) => {
  console.error(`[${req.method} ${req.originalUrl}]`, err.stack || err.message);
  res.status(err.status || 500).json({ message: err.message || "Internal server error" });
};