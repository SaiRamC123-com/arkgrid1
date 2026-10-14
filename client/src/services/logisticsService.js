import api from "./api";

export const logisticsApi = {
  get: (params) => api.get("/api/logistics", { params }).then((r) => r.data),
  setInventory: (id, body) => api.put(`/api/logistics/inventory/${id}`, body).then((r) => r.data),
  saveConfig: (body) => api.put("/api/logistics/config", body).then((r) => r.data),
  resetConfig: () => api.delete("/api/logistics/config").then((r) => r.data),
  seedDemo: () => api.post("/api/logistics/demo").then((r) => r.data),
  clearDemo: () => api.delete("/api/logistics/demo").then((r) => r.data),
};