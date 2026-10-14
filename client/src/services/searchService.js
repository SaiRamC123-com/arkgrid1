import api from "./api";

export const searchApi = {
  list: () => api.get("/api/search/cases").then((r) => r.data),
  create: (body) => api.post("/api/search/cases", body).then((r) => r.data.case),
  update: (id, body) => api.patch(`/api/search/cases/${id}`, body).then((r) => r.data.case),
  remove: (id) => api.delete(`/api/search/cases/${id}`).then((r) => r.data),
  zone: (id) => api.get(`/api/search/cases/${id}/zone`, { timeout: 70000 }).then((r) => r.data.zone),
  seedDemo: (lat, lng) => api.post("/api/search/demo", { lat, lng }).then((r) => r.data),
  clearDemo: () => api.delete("/api/search/demo").then((r) => r.data),
};