import api from "./api";

export const simApi = { run: (b) => api.post("/api/sim", b, { timeout: 90000 }).then((r) => r.data) };

export const safetyApi = {
  scenario: () => api.get("/api/safety/scenario").then((r) => r.data),
  publish: (simId, hours) => api.post("/api/safety/scenario", { simId, hours }).then((r) => r.data),
  clear: () => api.delete("/api/safety/scenario").then((r) => r.data),
};

export const advisoryApi = {
  active: (loc) => api.get("/api/advisories", { params: loc ? { lat: loc.lat, lng: loc.lng } : {} }).then((r) => r.data.advisories),
  manage: () => api.get("/api/advisories", { params: { all: 1 } }).then((r) => r.data.advisories),
  create: (b) => api.post("/api/advisories", b).then((r) => r.data.advisory),
  withdraw: (id) => api.delete(`/api/advisories/${id}`).then((r) => r.data),
};