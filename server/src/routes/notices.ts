import { Router } from "express";
import type { Repositories } from "../repositories/types";
import { requireAuth } from "../auth/middleware";

export function createNoticesRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const notices = await repos.notices.list(req.currentUser?.id);
    res.json(notices);
  });

  router.get("/:id", async (req, res) => {
    const notice = await repos.notices.findById(req.params.id, req.currentUser?.id);
    if (!notice) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(notice);
  });

  router.post("/:id/confirm", requireAuth, async (req, res) => {
    const updated = await repos.notices.markConfirmed(req.params.id, req.currentUser!.id);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  });

  return router;
}
