import type { AuditLogPage, AuditLogQuery } from "@hanmir/shared";
import { apiRequest } from "./api-client";

interface AuthOptions {
  token?: string;
}

// Phase 8 K-5 — 감사 로그 페이지.
export const auditService = {
  async searchAuditLogs(
    query: AuditLogQuery = {},
    opts: AuthOptions = {}
  ): Promise<AuditLogPage> {
    const q: Record<string, string> = {};
    if (query.limit != null) q.limit = String(query.limit);
    if (query.offset != null) q.offset = String(query.offset);
    if (query.action) q.action = query.action;
    if (query.actor) q.actor = query.actor;
    if (query.after) q.after = query.after;
    if (query.before) q.before = query.before;
    return apiRequest<AuditLogPage>("/audit", { token: opts.token, query: q });
  }
};
