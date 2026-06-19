import axios from "axios";
import { getApiBase } from "@/lib/env";
import { getToken, clearToken } from "@/lib/auth-context";

const apiClient = axios.create({
  baseURL: typeof window !== "undefined" ? getApiBase() : "http://127.0.0.1:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    const message =
      error.response?.data?.detail ||
      error.response?.statusText ||
      error.message ||
      "Request failed";
    return Promise.reject(new Error(typeof message === "string" ? message : JSON.stringify(message)));
  },
);

export default apiClient;
