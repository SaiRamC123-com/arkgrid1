import api from "./api";

export const incidentApi = {
  list: () => api.get("/api/incidents").then((r) => r.data),
  get: (id) => api.get(`/api/incidents/${id}`).then((r) => r.data),
  setOps: (id, body) => api.patch(`/api/incidents/${id}/ops`, body).then((r) => r.data.incident),
  recluster: () => api.post("/api/incidents/recluster").then((r) => r.data),
  seedDemo: (lat, lng) => api.post("/api/incidents/demo", { lat, lng }).then((r) => r.data),
  clearDemo: () => api.delete("/api/incidents/demo").then((r) => r.data),
};