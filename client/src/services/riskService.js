import api from "./api";

export const riskApi = {
  assess: (body) => api.post("/api/risk", body, { timeout: 70000 }).then((r) => r.data),
  model: () => api.get("/api/risk/model").then((r) => r.data),
};