import api from "./api";

export const priorityApi = {
  get: () => api.get("/api/priority").then((r) => r.data),
  saveWeights: (weights) => api.put("/api/priority/weights", { weights }).then((r) => r.data),
  resetWeights: () => api.delete("/api/priority/weights").then((r) => r.data),
  setFlow: (id, flow) => api.patch(`/api/priority/${id}/flow`, { flow }).then((r) => r.data),
  seedDemo: () => api.post("/api/priority/demo").then((r) => r.data),
  clearDemo: () => api.delete("/api/priority/demo").then((r) => r.data),
};