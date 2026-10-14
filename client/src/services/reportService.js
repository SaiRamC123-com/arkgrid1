import api from "./api";

export const reportApi = {
  list: () => api.get("/api/reports").then((r) => r.data.reports),
  create: (formData) => api.post("/api/reports", formData, { timeout: 60000 }).then((r) => r.data),
  confirm: (id) => api.post(`/api/reports/${id}/confirm`).then((r) => r.data.report),
  setStatus: (id, status) => api.patch(`/api/reports/${id}/status`, { status }).then((r) => r.data.report),
};