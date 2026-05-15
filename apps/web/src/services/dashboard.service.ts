import type { ActivityEvent, AdminKpi, AuditEntry } from "@hanmir/shared";
import { apiRequest } from "./api-client";

export interface DeptStat {
  name: string;
  sub: string;
  count: string;
}

interface AuthOptions {
  token?: string;
}

export const dashboardService = {
  async listAdminKpis(opts: AuthOptions = {}): Promise<AdminKpi[]> {
    return apiRequest<AdminKpi[]>("/dashboard/admin-kpis", { token: opts.token });
  },
  async listAudit(opts: AuthOptions = {}): Promise<AuditEntry[]> {
    return apiRequest<AuditEntry[]>("/dashboard/audit", { token: opts.token });
  },
  async listDeptStats(opts: AuthOptions = {}): Promise<DeptStat[]> {
    return apiRequest<DeptStat[]>("/dashboard/dept-stats", { token: opts.token });
  },
  async listDashboardActivities(opts: AuthOptions = {}): Promise<ActivityEvent[]> {
    return apiRequest<ActivityEvent[]>("/dashboard/activities", { token: opts.token });
  },
  async listProjectActivities(opts: AuthOptions = {}): Promise<ActivityEvent[]> {
    return apiRequest<ActivityEvent[]>("/dashboard/project-activities", { token: opts.token });
  }
};
