const axios = require("axios");

const http = axios.create({
  baseURL: process.env.ML_SERVICE_URL || "http://localhost:8000",
  timeout: 8000,
  headers: { "X-Internal-Key": process.env.ML_API_KEY || "" },
});

exports.cluster = async (events, params) => (await http.post("/cluster", { events, params })).data;
exports.health = async () => (await http.get("/health", { timeout: 2500 })).data;
exports.floodRisk = async (body) => (await http.post("/flood-risk", body, { timeout: 45000 })).data;
exports.modelCard = async () => (await http.get("/flood-risk/model")).data;
exports.searchZone = async (body) => (await http.post("/search-zone", body, { timeout: 45000 })).data;
exports.simulate = async (body) => (await http.post("/simulate", body, { timeout: 60000 })).data;