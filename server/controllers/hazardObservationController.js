const { getHazardAlerts } = require("../services/gdacs");

exports.listHazardAlerts = async (req, res, next) => {
  const hours = Number(req.query.hours || 24);
  try {
    res.json(await getHazardAlerts(hours, req.query.refresh === "1"));
  } catch (err) {
    next(err);
  }
};
