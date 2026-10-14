import api from "./api";

export const familyApi = {
  list: () => api.get("/api/family").then((r) => r.data.families),
  create: (name) => api.post("/api/family", { name }).then((r) => r.data),
  join: (inviteCode) => api.post("/api/family/join", { inviteCode }).then((r) => r.data),
  leave: (id) => api.post(`/api/family/${id}/leave`).then((r) => r.data),
  setStatus: (payload) => api.post("/api/family/status", payload).then((r) => r.data),
  sendLocation: (payload) => api.post("/api/family/location", payload).then((r) => r.data),
  activity: (id) => api.get(`/api/family/${id}/activity`).then((r) => r.data.activity),
  addZone: (id, zone) => api.post(`/api/family/${id}/zones`, zone).then((r) => r.data),
  removeZone: (id, zoneId) => api.delete(`/api/family/${id}/zones/${zoneId}`).then((r) => r.data),
};