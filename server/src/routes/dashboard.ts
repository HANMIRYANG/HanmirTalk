import { Router } from "express";
import { requireRole } from "../auth/middleware";
import type { Repositories } from "../repositories/types";
import {
  seedAdminKpis,
  seedDashboardActivities,
  seedDeptStats,
  seedProjectActivities
} from "../seed/dashboard";

export function createDashboardRouter(repos: Repositories): Router {
  const router = Router();

  const adminOnly = requireRole("admin", "super_admin");

  router.get("/overview", adminOnly, async (_req, res) => {
    const audit = await repos.audit.list({ limit: 20 });
    res.json({
      kpis: seedAdminKpis,
      audit,
      deptStats: seedDeptStats,
      activities: seedDashboardActivities
    });
  });

  router.get("/admin-kpis", adminOnly, (_req, res) => {
    res.json(seedAdminKpis);
  });

  // Real audit log: writes come from auditLog() helper, reads come from
  // audit repo with optional ?limit / ?action / ?actorUserId filters.
  router.get("/audit", adminOnly, async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const actorUserId =
      typeof req.query.actorUserId === "string" ? req.query.actorUserId : undefined;
    const entries = await repos.audit.list({
      limit: Number.isFinite(limit) ? limit : 50,
      action,
      actorUserId
    });
    res.json(entries);
  });

  router.get("/dept-stats", adminOnly, (_req, res) => {
    res.json(seedDeptStats);
  });

  // Personal/general activity feeds — any authenticated user can read.
  router.get("/activities", (_req, res) => {
    res.json(seedDashboardActivities);
  });

  router.get("/project-activities", (_req, res) => {
    res.json(seedProjectActivities);
  });

  return router;
}
