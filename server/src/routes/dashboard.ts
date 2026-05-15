import { Router } from "express";
import { requireRole } from "../auth/middleware";
import {
  seedAdminKpis,
  seedAuditEntries,
  seedDashboardActivities,
  seedDeptStats,
  seedProjectActivities
} from "../seed/dashboard";

export function createDashboardRouter(): Router {
  const router = Router();

  const adminOnly = requireRole("admin", "super_admin");

  router.get("/overview", adminOnly, (_req, res) => {
    res.json({
      kpis: seedAdminKpis,
      audit: seedAuditEntries,
      deptStats: seedDeptStats,
      activities: seedDashboardActivities
    });
  });

  router.get("/admin-kpis", adminOnly, (_req, res) => {
    res.json(seedAdminKpis);
  });

  router.get("/audit", adminOnly, (_req, res) => {
    res.json(seedAuditEntries);
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
