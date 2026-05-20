import type {
  AcceptInviteInput,
  CreateInvitationInput,
  InvitationPreview,
  UserInvitation
} from "@hanmir/shared";
import { apiRequest } from "./api-client";

interface AuthOptions {
  token?: string;
}

// Phase 8 K-2 — 사용자 초대 / 가입 승인.
export const invitationService = {
  async listInvitations(opts: AuthOptions = {}): Promise<UserInvitation[]> {
    return apiRequest<UserInvitation[]>("/invitations", { token: opts.token });
  },
  async createInvitation(
    input: CreateInvitationInput,
    opts: AuthOptions = {}
  ): Promise<UserInvitation> {
    return apiRequest<UserInvitation>("/invitations", {
      method: "POST",
      body: input,
      token: opts.token
    });
  },
  async deleteInvitation(
    id: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/invitations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token: opts.token
    });
  },

  // ── Public (비인증) — accept-invite 페이지에서 사용 ────────────────

  async getInvitationPreview(token: string): Promise<InvitationPreview> {
    return apiRequest<InvitationPreview>(
      `/auth/invitation/${encodeURIComponent(token)}`
    );
  },
  async acceptInvite(input: AcceptInviteInput): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>("/auth/accept-invite", {
      method: "POST",
      body: input
    });
  }
};
