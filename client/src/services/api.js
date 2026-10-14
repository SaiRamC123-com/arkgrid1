import axios from "axios";
import { auth } from "../firebase";

const rawBaseUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const api = axios.create({ baseURL: rawBaseUrl, timeout: 15000 });

api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) config.headers.Authorization = `Bearer ${await user.getIdToken()}`;
  return config;
});

export default api;