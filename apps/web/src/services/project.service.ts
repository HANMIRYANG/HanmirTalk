import type {
  CreateMilestoneInput,
  CreateProjectInput,
  Milestone,
  Project,
  UpdateMilestoneInput,
  UpdateProjectInput
} from "@hanmir/shared";
import { apiRequest, apiRequestOrNull } from "./api-client";

interface AuthOptions {
  token?: string;
}

export const projectService = {
  async listProjects(opts: AuthOptions = {}): Promise<Project[]> {
    return apiRequest<Project[]>("/projects", { token: opts.token });
  },
  async getProject(id: string, opts: AuthOptions = {}): Promise<Project | undefined> {
    return apiRequestOrNull<Project>(`/projects/${encodeURIComponent(id)}`, { token: opts.token });
  },
  async createProject(input: CreateProjectInput, opts: AuthOptions = {}): Promise<Project> {
    return apiRequest<Project>("/projects", { method: "POST", body: input, token: opts.token });
  },
  async updateProject(
    id: string,
    input: UpdateProjectInput,
    opts: AuthOptions = {}
  ): Promise<Project> {
    return apiRequest<Project>(`/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },
  // Server uses soft delete: status becomes "cancelled".
  async deleteProject(
    id: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean; project?: Project }> {
    return apiRequest<{ ok: boolean; project?: Project }>(
      `/projects/${encodeURIComponent(id)}`,
      { method: "DELETE", token: opts.token }
    );
  },
  async addProjectMember(
    id: string,
    userId: string,
    opts: AuthOptions = {}
  ): Promise<Project> {
    return apiRequest<Project>(`/projects/${encodeURIComponent(id)}/members`, {
      method: "POST",
      body: { userId },
      token: opts.token
    });
  },
  async removeProjectMember(
    id: string,
    userId: string,
    opts: AuthOptions = {}
  ): Promise<Project> {
    return apiRequest<Project>(
      `/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE", token: opts.token }
    );
  },
  async addMilestone(
    projectId: string,
    input: CreateMilestoneInput,
    opts: AuthOptions = {}
  ): Promise<Milestone> {
    return apiRequest<Milestone>(`/projects/${encodeURIComponent(projectId)}/milestones`, {
      method: "POST",
      body: input,
      token: opts.token
    });
  },
  async updateMilestone(
    projectId: string,
    milestoneId: string,
    input: UpdateMilestoneInput,
    opts: AuthOptions = {}
  ): Promise<Milestone> {
    return apiRequest<Milestone>(
      `/projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}`,
      { method: "PATCH", body: input, token: opts.token }
    );
  },
  async deleteMilestone(
    projectId: string,
    milestoneId: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(
      `/projects/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}`,
      { method: "DELETE", token: opts.token }
    );
  }
};
