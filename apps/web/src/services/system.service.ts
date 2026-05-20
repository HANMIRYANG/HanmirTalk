import type {
  SecurityPolicy,
  SystemHealth,
  SystemVersion
} from "@hanmir/shared";
import { apiRequest } from "./api-client";

interface AuthOptions {
  token?: string;
}

// Phase 8 K-6 / K-3 — 서비스 상태 · 버전 · 보안 정책.
export const systemService = {
  async getHealth(opts: AuthOptions = {}): Promise<SystemHealth> {
    return apiRequest<SystemHealth>("/system/health", { token: opts.token });
  },
  async getVersion(opts: AuthOptions = {}): Promise<SystemVersion> {
    return apiRequest<SystemVersion>("/system/version", { token: opts.token });
  },
  async getSecurityPolicy(opts: AuthOptions = {}): Promise<SecurityPolicy> {
    return apiRequest<SecurityPolicy>("/system/security-policy", {
      token: opts.token
    });
  }
};
