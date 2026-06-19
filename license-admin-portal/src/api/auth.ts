import apiClient from "./client";
import type { AuthUser } from "@/lib/auth-context";

export const authApi = {
  async login(email: string, password: string): Promise<{ access_token: string }> {
    const { data } = await apiClient.post("/auth/login", { email, password });
    return data;
  },

  async me(): Promise<AuthUser> {
    const { data } = await apiClient.get("/auth/me");
    return data;
  },
};
