import type { CreateTaskInput, TaskItem, UpdateTaskInput } from "@hanmir/shared";
import { apiRequest, apiRequestOrNull } from "./api-client";

interface AuthOptions {
  token?: string;
}

export const taskService = {
  async listByProject(projectId: string, opts: AuthOptions = {}): Promise<TaskItem[]> {
    return apiRequest<TaskItem[]>(`/projects/${encodeURIComponent(projectId)}/tasks`, {
      token: opts.token
    });
  },
  async createTask(
    projectId: string,
    input: CreateTaskInput,
    opts: AuthOptions = {}
  ): Promise<TaskItem> {
    return apiRequest<TaskItem>(`/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: "POST",
      body: input,
      token: opts.token
    });
  },
  async getTask(id: string, opts: AuthOptions = {}): Promise<TaskItem | undefined> {
    return apiRequestOrNull<TaskItem>(`/tasks/${encodeURIComponent(id)}`, { token: opts.token });
  },
  async updateTask(
    id: string,
    input: UpdateTaskInput,
    opts: AuthOptions = {}
  ): Promise<TaskItem> {
    return apiRequest<TaskItem>(`/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },
  async deleteTask(id: string, opts: AuthOptions = {}): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/tasks/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token: opts.token
    });
  }
};
