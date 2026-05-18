import { Router } from "express";
import type { CreateNoticeInput } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireAuth, requireRole } from "../auth/middleware";
import { realtime } from "../realtime";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function parseCreate(body: unknown): CreateNoticeInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isString(b.title) || !b.title.trim()) return { error: "title_required" };
  if (!isString(b.body) || !b.body.trim()) return { error: "body_required" };
  if (b.isMandatory !== undefined && typeof b.isMandatory !== "boolean")
    return { error: "isMandatory_invalid" };
  return {
    title: b.title.trim(),
    body: b.body.trim(),
    isMandatory: typeof b.isMandatory === "boolean" ? b.isMandatory : undefined
  };
}

export function createNoticesRouter(repos: Repositories): Router {
  const router = Router();
  // Company-wide notices: write/inspect restricted to admins. Can be broadened
  // once a per-team author role is introduced.
  const adminOnly = requireRole("admin", "super_admin");

  router.get("/", async (req, res) => {
    const notices = await repos.notices.list(req.currentUser?.id);
    res.json(notices);
  });

  router.post("/", adminOnly, async (req, res) => {
    const parsed = parseCreate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const user = req.currentUser!;
    const created = await repos.notices.create(parsed, {
      id: user.id,
      departmentName: user.departmentName
    });
    realtime.emitNoticeNew(created);
    res.status(201).json(created);
  });

  router.get("/:id", async (req, res) => {
    const notice = await repos.notices.findById(req.params.id, req.currentUser?.id);
    if (!notice) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(notice);
  });

  router.get("/:id/read-status", adminOnly, async (req, res) => {
    const status = await repos.notices.getReadStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(status);
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
