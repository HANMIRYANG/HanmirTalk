import type {
  CreateDecisionInput,
  Decision,
  UpdateDecisionInput
} from "@hanmir/shared";
import { apiRequest } from "./api-client";

export interface AuthOptions {
  token?: string;
}

export const decisionService = {
  // Phase 3 F-1 — list decisions for a project. Server filters by
  // project membership (admin sees all).
  async listByProject(
    projectId: string,
    opts: AuthOptions = {}
  ): Promise<Decision[]> {
    return apiRequest<Decision[]>(
      `/projects/${encodeURIComponent(projectId)}/decisions`,
      { token: opts.token }
    );
  },

  async createDecision(
    projectId: string,
    input: CreateDecisionInput,
    opts: AuthOptions = {}
  ): Promise<Decision> {
    return apiRequest<Decision>(
      `/projects/${encodeURIComponent(projectId)}/decisions`,
      {
        method: "POST",
        body: input,
        token: opts.token
      }
    );
  },

  async updateDecision(
    id: string,
    input: UpdateDecisionInput,
    opts: AuthOptions = {}
  ): Promise<Decision> {
    return apiRequest<Decision>(`/decisions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },

  async deleteDecision(
    id: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/decisions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token: opts.token
    });
  },

  // Mark this decision as confirmed by the current user. Idempotent.
  async confirmDecision(
    id: string,
    opts: AuthOptions = {}
  ): Promise<Decision> {
    return apiRequest<Decision>(
      `/decisions/${encodeURIComponent(id)}/confirm`,
      { method: "POST", token: opts.token }
    );
  },

  // Convert a chat message into a decision (writer role). Optional title
  // / content / decisionDate override the defaults the server derives
  // from the source message.
  async createFromMessage(
    messageId: string,
    overrides: {
      title?: string;
      content?: string;
      decisionDate?: string;
    } = {},
    opts: AuthOptions = {}
  ): Promise<Decision> {
    return apiRequest<Decision>(
      `/messages/${encodeURIComponent(messageId)}/create-decision`,
      {
        method: "POST",
        body: overrides,
        token: opts.token
      }
    );
  }
};
