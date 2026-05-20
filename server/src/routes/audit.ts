import { Router } from "express";
import type { AuditLogQuery } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";

// Phase 8 K-5 — 감사 로그 페이지. audit_logs는 auditLog() 헬퍼가 기록하고
// 여기서 페이징 + 필터(action / actor / 기간) 조회만 제공한다.
export function createAuditRouter(repos: Repositories): Router {
  const router = Router();
  const admins = requireRole("admin", "super_admin");

  router.get("/", admins, async (req, res) => {
    const num = (v: unknown): number | undefined => {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const str = (v: unknown): string | undefined =>
      typeof v === "string" && v.trim() ? v.trim() : undefined;

    const query: AuditLogQuery = {
      limit: num(req.query.limit),
      offset: num(req.query.offset),
      action: str(req.query.action),
      actor: str(req.query.actor),
      after: str(req.query.after),
      before: str(req.query.before)
    };
    res.json(await repos.audit.search(query));
  });

  return router;
}
