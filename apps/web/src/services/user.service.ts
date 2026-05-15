import type { CreateUserInput, UpdateUserInput, User } from "@hanmir/shared";
import { apiRequest, apiRequestOrNull } from "./api-client";

interface AuthOptions {
  token?: string;
}

export const userService = {
  async listUsers(opts: AuthOptions = {}): Promise<User[]> {
    return apiRequest<User[]>("/users", { token: opts.token });
  },
  async getUser(id: string, opts: AuthOptions = {}): Promise<User | undefined> {
    return apiRequestOrNull<User>(`/users/${encodeURIComponent(id)}`, { token: opts.token });
  },
  async createUser(input: CreateUserInput, opts: AuthOptions = {}): Promise<User> {
    return apiRequest<User>("/users", { method: "POST", body: input, token: opts.token });
  },
  async updateUser(
    id: string,
    input: UpdateUserInput,
    opts: AuthOptions = {}
  ): Promise<User> {
    return apiRequest<User>(`/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },
  async deactivateUser(id: string, opts: AuthOptions = {}): Promise<User> {
    return apiRequest<User>(`/users/${encodeURIComponent(id)}/deactivate`, {
      method: "PATCH",
      token: opts.token
    });
  }
};
