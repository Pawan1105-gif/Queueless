import axios from "axios";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001/api/v1";
export const apiRootUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, "");

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("queueless.accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem("queueless.accessToken")) {
      localStorage.removeItem("queueless.accessToken");
      localStorage.removeItem("queueless.user");
      window.dispatchEvent(new Event("queueless:auth-expired"));
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(", ");
  return error.message || "Something went wrong. Please try again.";
}

export default api;
