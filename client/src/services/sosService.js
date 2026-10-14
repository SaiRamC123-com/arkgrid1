import api from "./api";

export const sosApi = {
  mine: () => api.get("/api/sos/mine").then((r) => r.data.sos),
  ping: (id, loc) => api.post(`/api/sos/${id}/ping`, loc).then((r) => r.data),
  resolve: (id, outcome) => api.post(`/api/sos/${id}/resolve`, { outcome }).then((r) => r.data),
  getMedical: () => api.get("/api/sos/medical").then((r) => r.data.medical),
  saveMedical: (medical) => api.put("/api/sos/medical", medical).then((r) => r.data.medical),
};