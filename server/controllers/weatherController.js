const { getHeatGrid } = require("../services/weather");

exports.heatGrid = async (req, res, next) => {
  if (req.query.lat === undefined || req.query.lng === undefined || req.query.lat === "" || req.query.lng === "") {
    return res.status(400).json({ message: "lat and lng query parameters are required" });
  }
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ message: "lat and lng must be valid numbers" });
  }
  const radiusKm = Number(req.query.radiusKm ?? 25);
  if (!Number.isFinite(radiusKm) || ![10, 25, 50].includes(radiusKm)) {
    return res.status(400).json({ message: "radiusKm must be 10, 25, or 50" });
  }
  try {
    res.json(await getHeatGrid(lat, lng, radiusKm, req.query.refresh === "1"));
  } catch (err) {
    next(err);
  }
};
