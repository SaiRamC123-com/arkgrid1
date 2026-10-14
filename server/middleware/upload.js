const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) =>
    ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
      ? cb(null, true)
      : cb(Object.assign(new Error("Only JPEG, PNG or WebP photos are allowed"), { status: 400 })),
});

module.exports = (field) => (req, res, next) =>
  upload.single(field)(req, res, (err) => {
    if (err) {
      err.status = err.status || 400;
      if (err.code === "LIMIT_FILE_SIZE") err.message = "Photo is too large (max 4 MB)";
      return next(err);
    }
    next();
  });