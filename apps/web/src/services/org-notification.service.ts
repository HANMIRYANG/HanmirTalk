import type { OrgNotificationDefault } from "@hanmir/shared";
import { apiRequest } from "./api-client";

interface AuthOptions {
  token?: string;
}

// Phase 8 K-4 — 전사 기본 알림 정책.
export const orgNotificationService = {
  async listDefaults(opts: AuthOptions = {}): Promise<OrgNotificationDefault[]> {
    return apiRequest<OrgNotificationDefault[]>("/org-notification-defaults", {
      token: opts.token
    });
  },
  async setDefault(
    category: string,
    enabled: boolean,
    opts: AuthOptions = {}
  ): Promise<OrgNotificationDefault> {
    return apiRequest<OrgNotificationDefault>(
      `/org-notification-defaults/${encodeURIComponent(category)}`,
      { method: "PATCH", body: { enabled }, token: opts.token }
    );
  }
};
