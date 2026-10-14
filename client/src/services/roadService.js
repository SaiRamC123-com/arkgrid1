import api from "./api";

export const roadApi = {
  list: () => api.get("/api/roads").then((r) => r.data.roads),
  create: (body) => api.post("/api/roads", body).then((r) => r.data.road),
  confirm: (id) => api.post(`/api/roads/${id}/confirm`).then((r) => r.data.road),
  update: (id, patch = {}) => api.patch(`/api/roads/${id}`, patch).then((r) => r.data.road),
  remove: (id) => api.delete(`/api/roads/${id}`).then((r) => r.data),
};