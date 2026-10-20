import api from "./api";
import { parseShelterResponse } from "./shelterValidation";

export const shelterApi = {
  list: (signal) => api.get("/api/shelters", { signal }).then((r) => parseShelterResponse(r.data)),
  nearby: (lat, lng, signal, radiusM = 10000) => api.get("/api/shelters/nearby", { params: { lat, lng, radiusM }, signal }).then((r) => parseShelterResponse(r.data)),
  create: (body) => api.post("/api/shelters", body).then((r) => r.data),
  update: (id, patch) => api.patch(`/api/shelters/${id}`, patch).then((r) => r.data),
  adjust: (id, delta) => api.post(`/api/shelters/${id}/occupancy`, { delta }).then((r) => r.data),
  remove: (id) => api.delete(`/api/shelters/${id}`).then((r) => r.data),
  seed: (lat, lng) => api.post("/api/shelters/seed", { lat, lng }).then((r) => r.data),
  clearDemo: () => api.delete("/api/shelters/seed").then((r) => r.data),
};