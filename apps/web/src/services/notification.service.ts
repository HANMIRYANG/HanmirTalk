import type {
  Notification,
  NotificationSettings,
  UpdateNotificationSettingsInput
} from "@hanmir/shared";
import { apiRequest } from "./api-client";

export interface AuthOptions {
  token?: string;
}

export const notificationService = {
  async list(
    opts: AuthOptions & { unreadOnly?: boolean; limit?: number } = {}
  ): Promise<Notification[]> {
    const query: Record<string, string | number> = {};
    if (opts.unreadOnly) query.unread = "true";
    if (opts.limit) query.limit = opts.limit;
    return apiRequest<Notification[]>("/notifications", {
      query,
      token: opts.token
    });
  },

  async unreadCount(opts: AuthOptions = {}): Promise<number> {
    const response = await apiRequest<{ count: number }>(
      "/notifications/unread-count",
      { token: opts.token }
    );
    return response.count;
  },

  async markRead(id: string, opts: AuthOptions = {}): Promise<Notification> {
    return apiRequest<Notification>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "POST",
      token: opts.token
    });
  },

  async markAllRead(opts: AuthOptions = {}): Promise<{ count: number }> {
    return apiRequest<{ count: number }>("/notifications/read-all", {
      method: "POST",
      token: opts.token
    });
  },

  async getSettings(opts: AuthOptions = {}): Promise<NotificationSettings> {
    return apiRequest<NotificationSettings>("/notification-settings", {
      token: opts.token
    });
  },

  async updateSettings(
    input: UpdateNotificationSettingsInput,
    opts: AuthOptions = {}
  ): Promise<NotificationSettings> {
    return apiRequest<NotificationSettings>("/notification-settings", {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  }
};
