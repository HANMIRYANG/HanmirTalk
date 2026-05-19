import { Router, type Request, type Response } from "express";
import type { CreateDecisionInput, UpdateDecisionInput } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";
import { realtime } from "../realtime";
import { auditLog } from "../audit";

// Phase 3 F-1 — decisions endpoints. Mounted at /api/v1/decisions for
// per-id operations and /api/v1/projects/:projectId/decisions for list +
// create (reused from projects router via this file's helper, mounted
// separately in app.ts). The create-from-message route lives under
// /api/v1/messages/:messageId/create-decision in the messages router to
// match the URL the roadmap specified.

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function parseCreate(body: unknown): CreateDecisionInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isString(b.title) || !b.title.trim()) return { error: "title_required" };
  if (!isString(b.content) || !b.content.trim()) return { error: "content_required" };
  if (b.decisionDate !== undefined) {
    if (!isString(b.decisionDate)) return { error: "decisionDate_invalid" };
    // Loose validation — accept any non-empty string. Postgres DATE
    // coercion will reject malformed values at insert time.
    if (!b.decisionDate.trim()) return { error: "decisionDate_invalid" };
  }
  if (b.sourceMessageId !== undefined && !isString(b.sourceMessageId)) {
    return { error: "sourceMessageId_invalid" };
  }
  return {
    title: b.title.trim(),
    content: b.content.trim(),
    decisionDate: isString(b.decisionDate) ? b.decisionDate.trim() : undefined,
    sourceMessageId: isString(b.sourceMessageId) ? b.sourceMessageId : undefined
  };
}

function parseUpdate(body: unknown): UpdateDecisionInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const out: UpdateDecisionInput = {};
  if (b.title !== undefined) {
    if (!isString(b.title) || !b.title.trim()) return { error: "title_invalid" };
    out.title = b.title.trim();
  }
  if (b.content !== undefined) {
    if (!isString(b.content) || !b.content.trim()) return { error: "content_invalid" };
    out.content = b.content.trim();
  }
  if (b.decisionDate !== undefined) {
    if (!isString(b.decisionDate) || !b.decisionDate.trim())
      return { error: "decisionDate_invalid" };
    out.decisionDate = b.decisionDate.trim();
  }
  return out;
}

// Shared membership check for project-scoped reads. Admin / super_admin
// pass; everyone else must be a project member. Returns false (and sends
// the response) when denied.
async function ensureProjectAccess(
  repos: Repositories,
  req: Request,
  res: Response,
  projectId: string
): Promise<boolean> {
  const me = req.currentUser!;
  const project = await repos.projects.findById(projectId);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return false;
  }
  if (me.role === "admin" || me.role === "super_admin") return true;
  if (!project.memberIds.includes(me.id)) {
    res.status(404).json({ error: "not_found" });
    return false;
  }
  return true;
}

// /api/v1/decisions/:id and /api/v1/decisions/:id/* — per-id operations.
export function createDecisionsRouter(repos: Repositories): Router {
  const router = Router();
  const writers = requireRole("admin", "super_admin", "manager", "project_owner");

  router.get("/:id", async (req, res) => {
    const me = req.currentUser!;
    const decision = await repos.decisions.findById(req.params.id, me.id);
    if (!decision) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    // Same project-membership gate as the list endpoint.
    const ok = await ensureProjectAccess(repos, req, res, decision.projectId);
    if (!ok) return;
    res.json(decision);
  });

  router.patch("/:id", writers, async (req, res) => {
    const me = req.currentUser!;
    const existing = await repos.decisions.findById(req.params.id, me.id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (existing.isDeleted) {
      res.status(409).json({ error: "already_deleted" });
      return;
    }
    // Edit allowed for: admins, super_admins, or the user who recorded it.
    const isAdmin = me.role === "admin" || me.role === "super_admin";
    const isAuthor = existing.decidedById === me.id;
    if (!isAdmin && !isAuthor) {
      res.status(403).json({ error: "not_decided_by_or_admin" });
      return;
    }
    const parsed = parseUpdate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updated = await repos.decisions.update(req.params.id, parsed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "decision.update",
      targetType: "decision",
      targetId: updated.id,
      targetLabel: updated.title,
      meta: { projectId: updated.projectId, changes: parsed }
    });
    realtime.emitDecisionUpdated(updated.projectId, updated);
    res.json(updated);
  });

  router.delete("/:id", async (req, res) => {
    const me = req.currentUser!;
    const existing = await repos.decisions.findById(req.params.id, me.id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const isAdmin = me.role === "admin" || me.role === "super_admin";
    const isAuthor = existing.decidedById === me.id;
    if (!isAdmin && !isAuthor) {
      res.status(403).json({ error: "not_decided_by_or_admin" });
      return;
    }
    if (existing.isDeleted) {
      res.json({ ok: true });
      return;
    }
    const ok = await repos.decisions.softDelete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const after = await repos.decisions.findById(req.params.id, me.id);
    if (after) realtime.emitDecisionDeleted(existing.projectId, after);
    await auditLog(repos, req, {
      action: "decision.delete",
      targetType: "decision",
      targetId: req.params.id,
      targetLabel: existing.title,
      level: "warn",
      meta: { projectId: existing.projectId, originalDecidedById: existing.decidedById }
    });
    res.json({ ok: true });
  });

  // Per-user confirmation. Mirrors POST /notices/:id/confirm.
  router.post("/:id/confirm", async (req, res) => {
    const me = req.currentUser!;
    const existing = await repos.decisions.findById(req.params.id, me.id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (existing.isDeleted) {
      res.status(409).json({ error: "already_deleted" });
      return;
    }
    const ok = await ensureProjectAccess(repos, req, res, existing.projectId);
    if (!ok) return;
    const updated = await repos.decisions.markConfirmed(req.params.id, me.id);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  });

  // Read-status panel. Admin or the user who recorded the decision.
  router.get("/:id/read-status", async (req, res) => {
    const me = req.currentUser!;
    const decision = await repos.decisions.findById(req.params.id, me.id);
    if (!decision) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const isAdmin = me.role === "admin" || me.role === "super_admin";
    const isAuthor = decision.decidedById === me.id;
    if (!isAdmin && !isAuthor) {
      res.status(403).json({ error: "not_decided_by_or_admin" });
      return;
    }
    const status = await repos.decisions.getReadStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(status);
  });

  return router;
}

// /api/v1/projects/:projectId/decisions — list + create. Mounted by
// app.ts on top of the projects path so the URL nests naturally.
export function createProjectDecisionsRouter(repos: Repositories): Router {
  const router = Router({ mergeParams: true });
  const writers = requireRole("admin", "super_admin", "manager", "project_owner");

  router.get("/", async (req, res) => {
    const projectId = (req.params as { projectId?: string }).projectId ?? "";
    const me = req.currentUser!;
    const ok = await ensureProjectAccess(repos, req, res, projectId);
    if (!ok) return;
    const list = await repos.decisions.listByProject(projectId, me.id);
    res.json(list);
  });

  router.post("/", writers, async (req, res) => {
    const projectId = (req.params as { projectId?: string }).projectId ?? "";
    const ok = await ensureProjectAccess(repos, req, res, projectId);
    if (!ok) return;
    const parsed = parseCreate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const me = req.currentUser!;
    const created = await repos.decisions.create(projectId, parsed, { id: me.id });
    await auditLog(repos, req, {
      action: "decision.create",
      targetType: "decision",
      targetId: created.id,
      targetLabel: created.title,
      meta: {
        projectId,
        sourceMessageId: created.sourceMessageId,
        decisionDate: created.decisionDate
      }
    });
    realtime.emitDecisionNew(projectId, created);
    res.status(201).json(created);
  });

  return router;
}
