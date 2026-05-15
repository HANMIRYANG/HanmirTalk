import type { User } from "@hanmir/shared";
import { apiRequest, apiRequestAuthOrNull } from "./api-client";

interface LoginResponse {
  ok: boolean;
  token: string;
  user: User;
}

export const authService = {
  async getMe(token?: string): Promise<User> {
    return apiRequest<User>("/auth/me", { token });
  },
  async tryGetMe(token?: string): Promise<User | undefined> {
    return apiRequestAuthOrNull<User>("/auth/me", { token });
  },
  async login(idOrEmail: string, password: string): Promise<LoginResponse> {
    const body = idOrEmail.includes("@")
      ? { email: idOrEmail, password }
      : { id: idOrEmail, password };
    return apiRequest<LoginResponse>("/auth/login", { method: "POST", body });
  },
  async logout(token?: string): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>("/auth/logout", { method: "POST", token });
  }
};
