import api from "./api";

export const opsApi = {
  overview: () => api.get("/api/ops/overview").then((r) => r.data),
  seedDemo: (lat, lng) => api.post("/api/ops/demo", { lat, lng }).then((r) => r.data),
  clearDemo: () => api.delete("/api/ops/demo").then((r) => r.data),
};

export const teamApi = {
  create: (b) => api.post("/api/teams", b).then((r) => r.data),
  update: (id, b) => api.patch(`/api/teams/${id}`, b).then((r) => r.data),
  remove: (id) => api.delete(`/api/teams/${id}`).then((r) => r.data),
  join: (id) => api.post(`/api/teams/${id}/join`).then((r) => r.data),
  leave: () => api.post("/api/teams/leave").then((r) => r.data),
  assign: (id, incidentId) => api.post(`/api/teams/${id}/assign`, { incidentId }).then((r) => r.data),
  sendLocation: (loc) => api.post("/api/teams/me/location", loc).then((r) => r.data),
};

export const infraApi = {
  create: (b) => api.post("/api/infra", b).then((r) => r.data),
  update: (id, b) => api.patch(`/api/infra/${id}`, b).then((r) => r.data),
  remove: (id) => api.delete(`/api/infra/${id}`).then((r) => r.data),
};