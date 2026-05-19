import { Router } from "express";
import type {
  CreateProjectInput,
  CreateTaskInput,
  ProjectStatus,
  SalesStatus,
  TaskPriority,
  TaskStatus,
  UpdateProjectInput
} from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";
import { auditLog } from "../audit";

const VALID_PROJECT_STATUS: ProjectStatus[] = [
  "ready",
  "in_progress",
  "review",
  "on_hold",
  "done",
  "cancelled"
];

const VALID_SALES_STATUS: SalesStatus[] = [
  "unavailable",
  "preparing",
  "internal",
  "conditional",
  "available"
];

const VALID_TASK_STATUS: TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
  "on_hold"
];

const VALID_TASK_PRIORITY: TaskPriority[] = ["top", "high", "normal", "low"];

function parseCreateTask(body: unknown): CreateTaskInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isString(b.title) || !b.title.trim()) return { error: "title_required" };
  if (b.status !== undefined) {
    if (!isString(b.status) || !VALID_TASK_STATUS.includes(b.status as TaskStatus))
      return { error: "status_invalid" };
  }
  if (b.priority !== undefined) {
    if (!isString(b.priority) || !VALID_TASK_PRIORITY.includes(b.priority as TaskPriority))
      return { error: "priority_invalid" };
  }
  if (b.assigneeIds !== undefined && !isStringArray(b.assigneeIds))
    return { error: "assigneeIds_invalid" };
  if (b.progress !== undefined) {
    if (!isNumber(b.progress)) return { error: "progress_invalid" };
  }
  return {
    title: b.title.trim(),
    code: isString(b.code) ? b.code : undefined,
    status: isString(b.status) ? (b.status as TaskStatus) : undefined,
    priority: isString(b.priority) ? (b.priority as TaskPriority) : undefined,
    assigneeIds: isStringArray(b.assigneeIds) ? b.assigneeIds : undefined,
    reviewerId: isString(b.reviewerId) ? b.reviewerId : undefined,
    startDate: isString(b.startDate) ? b.startDate : undefined,
    dueDate: isString(b.dueDate) ? b.dueDate : undefined,
    dueLabel: isString(b.dueLabel) ? b.dueLabel : undefined,
    progress: isNumber(b.progress) ? Math.max(0, Math.min(100, b.progress)) : undefined,
    description: isString(b.description) ? b.description : undefined
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseCreateProject(body: unknown): CreateProjectInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isString(b.name) || !b.name.trim()) return { error: "name_required" };
  if (b.status !== undefined) {
    if (!isString(b.status) || !VALID_PROJECT_STATUS.includes(b.status as ProjectStatus))
      return { error: "status_invalid" };
  }
  if (b.salesStatus !== undefined) {
    if (!isString(b.salesStatus) || !VALID_SALES_STATUS.includes(b.salesStatus as SalesStatus))
      return { error: "salesStatus_invalid" };
  }
  if (b.memberIds !== undefined && !isStringArray(b.memberIds))
    return { error: "memberIds_invalid" };
  if (b.goals !== undefined && !isStringArray(b.goals)) return { error: "goals_invalid" };
  if (b.outputs !== undefined && !isStringArray(b.outputs)) return { error: "outputs_invalid" };
  if (b.relatedProductIds !== undefined && !isStringArray(b.relatedProductIds))
    return { error: "relatedProductIds_invalid" };

  return {
    code: isString(b.code) ? b.code : undefined,
    name: b.name.trim(),
    fullName: isString(b.fullName) ? b.fullName : undefined,
    status: isString(b.status) ? (b.status as ProjectStatus) : undefined,
    stageLabel: isString(b.stageLabel) ? b.stageLabel : undefined,
    department: isString(b.department) ? b.department : undefined,
    ownerName: isString(b.ownerName) ? b.ownerName : undefined,
    startDate: isString(b.startDate) ? b.startDate : undefined,
    dueDate: isString(b.dueDate) ? b.dueDate : undefined,
    description: isString(b.description) ? b.description : undefined,
    goals: isStringArray(b.goals) ? b.goals : undefined,
    outputs: isStringArray(b.outputs) ? b.outputs : undefined,
    memberIds: isStringArray(b.memberIds) ? b.memberIds : undefined,
    budget: isString(b.budget) ? b.budget : undefined,
    type: isString(b.type) ? b.type : undefined,
    externalPartners: isString(b.externalPartners) ? b.externalPartners : undefined,
    relatedProductIds: isStringArray(b.relatedProductIds) ? b.relatedProductIds : undefined,
    salesStatus: isString(b.salesStatus) ? (b.salesStatus as SalesStatus) : undefined
  };
}

function parseUpdateProject(body: unknown): UpdateProjectInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const out: UpdateProjectInput = {};
  if (b.code !== undefined) {
    if (!isString(b.code)) return { error: "code_invalid" };
    out.code = b.code;
  }
  if (b.name !== undefined) {
    if (!isString(b.name) || !b.name.trim()) return { error: "name_invalid" };
    out.name = b.name.trim();
  }
  if (b.fullName !== undefined) {
    if (!isString(b.fullName)) return { error: "fullName_invalid" };
    out.fullName = b.fullName;
  }
  if (b.status !== undefined) {
    if (!isString(b.status) || !VALID_PROJECT_STATUS.includes(b.status as ProjectStatus))
      return { error: "status_invalid" };
    out.status = b.status as ProjectStatus;
  }
  if (b.stageLabel !== undefined) {
    if (!isString(b.stageLabel)) return { error: "stageLabel_invalid" };
    out.stageLabel = b.stageLabel;
  }
  if (b.department !== undefined) {
    if (!isString(b.department)) return { error: "department_invalid" };
    out.department = b.department;
  }
  if (b.ownerName !== undefined) {
    if (!isString(b.ownerName)) return { error: "ownerName_invalid" };
    out.ownerName = b.ownerName;
  }
  if (b.startDate !== undefined) {
    if (!isString(b.startDate)) return { error: "startDate_invalid" };
    out.startDate = b.startDate;
  }
  if (b.dueDate !== undefined) {
    if (!isString(b.dueDate)) return { error: "dueDate_invalid" };
    out.dueDate = b.dueDate;
  }
  if (b.progress !== undefined) {
    if (!isNumber(b.progress)) return { error: "progress_invalid" };
    out.progress = Math.max(0, Math.min(100, b.progress));
  }
  if (b.description !== undefined) {
    if (!isString(b.description)) return { error: "description_invalid" };
    out.description = b.description;
  }
  if (b.goals !== undefined) {
    if (!isStringArray(b.goals)) return { error: "goals_invalid" };
    out.goals = b.goals;
  }
  if (b.outputs !== undefined) {
    if (!isStringArray(b.outputs)) return { error: "outputs_invalid" };
    out.outputs = b.outputs;
  }
  if (b.budget !== undefined) {
    if (!isString(b.budget)) return { error: "budget_invalid" };
    out.budget = b.budget;
  }
  if (b.type !== undefined) {
    if (!isString(b.type)) return { error: "type_invalid" };
    out.type = b.type;
  }
  if (b.externalPartners !== undefined) {
    if (!isString(b.externalPartners)) return { error: "externalPartners_invalid" };
    out.externalPartners = b.externalPartners;
  }
  if (b.relatedProductIds !== undefined) {
    if (!isStringArray(b.relatedProductIds)) return { error: "relatedProductIds_invalid" };
    out.relatedProductIds = b.relatedProductIds;
  }
  if (b.salesStatus !== undefined) {
    if (!isString(b.salesStatus) || !VALID_SALES_STATUS.includes(b.salesStatus as SalesStatus))
      return { error: "salesStatus_invalid" };
    out.salesStatus = b.salesStatus as SalesStatus;
  }
  return out;
}

// Phase 1 D-5: enforce that non-admin writers also belong to the project
// they're touching. Returns false (and responds with 404/403) when the
// check fails; route handler should `return` immediately.
async function ensureProjectAccess(
  repos: Repositories,
  req: import("express").Request,
  res: import("express").Response,
  projectId: string
): Promise<{ allowed: true } | { allowed: false }> {
  const me = req.currentUser!;
  const isAdmin = me.role === "admin" || me.role === "super_admin";
  const project = await repos.projects.findById(projectId);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return { allowed: false };
  }
  if (!isAdmin && !project.memberIds.includes(me.id)) {
    res.status(403).json({ error: "not_a_project_member" });
    return { allowed: false };
  }
  return { allowed: true };
}

export function createProjectsRouter(repos: Repositories): Router {
  const router = Router();

  // Role-level guard for project creation (no project-level check possible
  // since the project doesn't exist yet). PATCH / DELETE / member ops add
  // a per-project membership check via ensureProjectAccess.
  const writers = requireRole("admin", "super_admin", "manager", "project_owner");

  router.get("/", async (_req, res) => {
    const projects = await repos.projects.list();
    res.json(projects);
  });

  router.get("/:id", async (req, res) => {
    const project = await repos.projects.findById(req.params.id);
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(project);
  });

  router.post("/", writers, async (req, res) => {
    const parsed = parseCreateProject(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const project = await repos.projects.create(parsed);
    await auditLog(repos, req, {
      action: "project.create",
      targetType: "project",
      targetId: project.id,
      targetLabel: `${project.code} ${project.name}`
    });
    res.status(201).json(project);
  });

  router.patch("/:id", writers, async (req, res) => {
    const access = await ensureProjectAccess(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const parsed = parseUpdateProject(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updated = await repos.projects.update(req.params.id, parsed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "project.update",
      targetType: "project",
      targetId: updated.id,
      targetLabel: `${updated.code} ${updated.name}`,
      // Record only the keys that actually changed — full project objects
      // are noisy and `meta` is rendered in the audit log UI.
      meta: parsed
    });
    res.json(updated);
  });

  // Soft delete: marks `status = "cancelled"` instead of removing the row, so
  // related tasks / messages / files keep their references.
  router.delete("/:id", writers, async (req, res) => {
    const access = await ensureProjectAccess(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const cancelled = await repos.projects.cancel(req.params.id);
    if (!cancelled) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "project.cancel",
      targetType: "project",
      targetId: cancelled.id,
      targetLabel: `${cancelled.code} ${cancelled.name}`,
      level: "warn"
    });
    res.json({ ok: true, project: cancelled });
  });

  router.post("/:id/members", writers, async (req, res) => {
    const access = await ensureProjectAccess(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const body = req.body as { userId?: unknown } | undefined;
    const userId = isString(body?.userId) ? (body!.userId as string) : "";
    if (!userId.trim()) {
      res.status(400).json({ error: "userId_required" });
      return;
    }
    const user = await repos.users.findById(userId);
    if (!user) {
      res.status(400).json({ error: "user_not_found" });
      return;
    }
    const updated = await repos.projects.addMember(req.params.id, userId);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "project.member.add",
      targetType: "project",
      targetId: updated.id,
      targetLabel: `${updated.code} ${updated.name}`,
      meta: { addedUserId: userId, addedUserName: user.name }
    });
    res.status(201).json(updated);
  });

  router.delete("/:id/members/:userId", writers, async (req, res) => {
    const access = await ensureProjectAccess(repos, req, res, req.params.id);
    if (!access.allowed) return;
    // Look up the user up-front for the audit label; null is fine if the
    // user was already deleted — we still record the id.
    const removedUser = await repos.users.findById(req.params.userId);
    const updated = await repos.projects.removeMember(req.params.id, req.params.userId);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "project.member.remove",
      targetType: "project",
      targetId: updated.id,
      targetLabel: `${updated.code} ${updated.name}`,
      level: "warn",
      meta: { removedUserId: req.params.userId, removedUserName: removedUser?.name }
    });
    res.json(updated);
  });

  router.get("/:projectId/tasks", async (req, res) => {
    const project = await repos.projects.findById(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const tasks = await repos.tasks.listByProject(req.params.projectId);
    res.json(tasks);
  });

  router.post("/:projectId/tasks", writers, async (req, res) => {
    const access = await ensureProjectAccess(repos, req, res, req.params.projectId);
    if (!access.allowed) return;
    const parsed = parseCreateTask(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const task = await repos.tasks.create(req.params.projectId, parsed);
    await auditLog(repos, req, {
      action: "task.create",
      targetType: "task",
      targetId: task.id,
      targetLabel: `${task.code} ${task.title}`,
      meta: { projectId: req.params.projectId, status: task.status, priority: task.priority }
    });
    res.status(201).json(task);
  });

  return router;
}
