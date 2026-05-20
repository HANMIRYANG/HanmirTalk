import { Router } from "express";
import { NOTIFICATION_CATEGORIES } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";
import { auditLog } from "../audit";

// Phase 8 K-4 — 전사 기본 알림 정책. 카테고리별 회사 전체 on/off.
export function createOrgNotificationsRouter(repos: Repositories): Router {
  const router = Router();
  const admins = requireRole("admin", "super_admin");

  router.get("/", admins, async (_req, res) => {
    res.json(await repos.orgNotifications.list());
  });

  router.patch("/:category", admins, async (req, res) => {
    const category = req.params.category;
    if (!(NOTIFICATION_CATEGORIES as string[]).includes(category)) {
      res.status(400).json({ error: "category_invalid" });
      return;
    }
    const enabled = ((req.body ?? {}) as { enabled?: unknown }).enabled;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled_invalid" });
      return;
    }
    const updated = await repos.orgNotifications.setEnabled(
      category,
      enabled,
      req.currentUser!.id
    );
    await auditLog(repos, req, {
      action: "org_notification.update",
      targetType: "org_notification",
      targetId: category,
      targetLabel: category,
      meta: { enabled }
    });
    res.json(updated);
  });

  return router;
}
