import { Router } from "express";
import type {
  TaskPriority,
  TaskStatus,
  UpdateTaskInput
} from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";

const VALID_TASK_STATUS: TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
  "on_hold"
];

const VALID_TASK_PRIORITY: TaskPriority[] = ["top", "high", "normal", "low"];
const VALID_DUE_STATE = ["late", "today", "normal"] as const;

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseUpdateTask(body: unknown): UpdateTaskInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const out: UpdateTaskInput = {};
  if (b.title !== undefined) {
    if (!isString(b.title) || !b.title.trim()) return { error: "title_invalid" };
    out.title = b.title.trim();
  }
  if (b.code !== undefined) {
    if (!isString(b.code)) return { error: "code_invalid" };
    out.code = b.code;
  }
  if (b.status !== undefined) {
    if (!isString(b.status) || !VALID_TASK_STATUS.includes(b.status as TaskStatus))
      return { error: "status_invalid" };
    out.status = b.status as TaskStatus;
  }
  if (b.priority !== undefined) {
    if (!isString(b.priority) || !VALID_TASK_PRIORITY.includes(b.priority as TaskPriority))
      return { error: "priority_invalid" };
    out.priority = b.priority as TaskPriority;
  }
  if (b.assigneeIds !== undefined) {
    if (!isStringArray(b.assigneeIds)) return { error: "assigneeIds_invalid" };
    out.assigneeIds = b.assigneeIds;
  }
  if (b.reviewerId !== undefined) {
    if (!isString(b.reviewerId)) return { error: "reviewerId_invalid" };
    out.reviewerId = b.reviewerId;
  }
  if (b.startDate !== undefined) {
    if (!isString(b.startDate)) return { error: "startDate_invalid" };
    out.startDate = b.startDate;
  }
  if (b.dueDate !== undefined) {
    if (!isString(b.dueDate)) return { error: "dueDate_invalid" };
    out.dueDate = b.dueDate;
  }
  if (b.dueLabel !== undefined) {
    if (!isString(b.dueLabel)) return { error: "dueLabel_invalid" };
    out.dueLabel = b.dueLabel;
  }
  if (b.dueState !== undefined) {
    if (
      !isString(b.dueState) ||
      !(VALID_DUE_STATE as readonly string[]).includes(b.dueState)
    )
      return { error: "dueState_invalid" };
    out.dueState = b.dueState as UpdateTaskInput["dueState"];
  }
  if (b.delayDays !== undefined) {
    if (!isNumber(b.delayDays)) return { error: "delayDays_invalid" };
    out.delayDays = b.delayDays;
  }
  if (b.progress !== undefined) {
    if (!isNumber(b.progress)) return { error: "progress_invalid" };
    out.progress = Math.max(0, Math.min(100, b.progress));
  }
  if (b.description !== undefined) {
    if (!isString(b.description)) return { error: "description_invalid" };
    out.description = b.description;
  }
  return out;
}

// Phase 1 D-5: tasks inherit their parent project's membership rules.
async function ensureTaskProjectAccess(
  repos: Repositories,
  req: import("express").Request,
  res: import("express").Response,
  taskId: string
): Promise<{ allowed: true; projectId: string } | { allowed: false }> {
  const me = req.currentUser!;
  const task = await repos.tasks.findById(taskId);
  if (!task) {
    res.status(404).json({ error: "not_found" });
    return { allowed: false };
  }
  const isAdmin = me.role === "admin" || me.role === "super_admin";
  if (isAdmin) return { allowed: true, projectId: task.projectId };
  const project = await repos.projects.findById(task.projectId);
  if (!project) {
    // Orphaned task: treat as not found rather than 500.
    res.status(404).json({ error: "not_found" });
    return { allowed: false };
  }
  if (!project.memberIds.includes(me.id)) {
    res.status(403).json({ error: "not_a_project_member" });
    return { allowed: false };
  }
  return { allowed: true, projectId: task.projectId };
}

export function createTasksRouter(repos: Repositories): Router {
  const router = Router();
  const writers = requireRole("admin", "super_admin", "manager", "project_owner");

  router.get("/:id", async (req, res) => {
    const task = await repos.tasks.findById(req.params.id);
    if (!task) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(task);
  });

  router.patch("/:id", writers, async (req, res) => {
    const access = await ensureTaskProjectAccess(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const parsed = parseUpdateTask(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updated = await repos.tasks.update(req.params.id, parsed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  });

  router.delete("/:id", writers, async (req, res) => {
    const access = await ensureTaskProjectAccess(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const ok = await repos.tasks.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
