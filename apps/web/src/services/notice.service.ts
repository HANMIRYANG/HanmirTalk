import type { CreateNoticeInput, Notice, NoticeReadStatus } from "@hanmir/shared";
import { apiRequest, apiRequestOrNull } from "./api-client";

interface AuthOptions {
  token?: string;
}

export const noticeService = {
  async listNotices(opts: AuthOptions = {}): Promise<Notice[]> {
    return apiRequest<Notice[]>("/notices", { token: opts.token });
  },
  async getNotice(id: string, opts: AuthOptions = {}): Promise<Notice | undefined> {
    return apiRequestOrNull<Notice>(`/notices/${encodeURIComponent(id)}`, { token: opts.token });
  },
  async createNotice(input: CreateNoticeInput, opts: AuthOptions = {}): Promise<Notice> {
    return apiRequest<Notice>("/notices", { method: "POST", body: input, token: opts.token });
  },
  async getReadStatus(id: string, opts: AuthOptions = {}): Promise<NoticeReadStatus> {
    return apiRequest<NoticeReadStatus>(
      `/notices/${encodeURIComponent(id)}/read-status`,
      { token: opts.token }
    );
  },
  async confirmNotice(id: string, opts: AuthOptions = {}): Promise<Notice> {
    return apiRequest<Notice>(`/notices/${encodeURIComponent(id)}/confirm`, {
      method: "POST",
      token: opts.token
    });
  }
};
