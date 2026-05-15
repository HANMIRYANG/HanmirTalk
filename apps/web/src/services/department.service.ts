import type {
  CreateDepartmentInput,
  Department,
  UpdateDepartmentInput
} from "@hanmir/shared";
import { apiRequest } from "./api-client";

interface AuthOptions {
  token?: string;
}

export const departmentService = {
  async listDepartments(opts: AuthOptions = {}): Promise<Department[]> {
    return apiRequest<Department[]>("/departments", { token: opts.token });
  },
  async createDepartment(
    input: CreateDepartmentInput,
    opts: AuthOptions = {}
  ): Promise<Department> {
    return apiRequest<Department>("/departments", {
      method: "POST",
      body: input,
      token: opts.token
    });
  },
  async updateDepartment(
    id: string,
    input: UpdateDepartmentInput,
    opts: AuthOptions = {}
  ): Promise<Department> {
    return apiRequest<Department>(`/departments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },
  async deleteDepartment(id: string, opts: AuthOptions = {}): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/departments/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token: opts.token
    });
  }
};
