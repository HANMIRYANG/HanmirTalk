import { Router } from "express";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";
import { auditLog } from "../audit";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function parseCreate(body: unknown): CreateDepartmentInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isString(b.name) || !b.name.trim()) return { error: "name_required" };
  return {
    name: b.name.trim(),
    description: isString(b.description) ? b.description : undefined
  };
}

function parseUpdate(body: unknown): UpdateDepartmentInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const out: UpdateDepartmentInput = {};
  if (b.name !== undefined) {
    if (!isString(b.name) || !b.name.trim()) return { error: "name_invalid" };
    out.name = b.name.trim();
  }
  if (b.description !== undefined) {
    if (!isString(b.description)) return { error: "description_invalid" };
    out.description = b.description;
  }
  return out;
}

export function createDepartmentsRouter(repos: Repositories): Router {
  const router = Router();
  const adminOnly = requireRole("admin", "super_admin");

  router.get("/", async (_req, res) => {
    const departments = await repos.departments.list();
    res.json(departments);
  });

  router.post("/", adminOnly, async (req, res) => {
    const parsed = parseCreate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const dept = await repos.departments.create(parsed);
    await auditLog(repos, req, {
      action: "department.create",
      targetType: "department",
      targetId: dept.id,
      targetLabel: dept.name
    });
    res.status(201).json(dept);
  });

  router.patch("/:id", adminOnly, async (req, res) => {
    const parsed = parseUpdate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updated = await repos.departments.update(req.params.id, parsed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "department.update",
      targetType: "department",
      targetId: updated.id,
      targetLabel: updated.name,
      meta: parsed
    });
    res.json(updated);
  });

  router.delete("/:id", adminOnly, async (req, res) => {
    const result = await repos.departments.delete(req.params.id);
    if (result.ok) {
      await auditLog(repos, req, {
        action: "department.delete",
        targetType: "department",
        targetId: req.params.id,
        level: "warn"
      });
      res.json({ ok: true });
      return;
    }
    if (result.reason === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    // 409 = conflict: department still in use by active users.
    res.status(409).json({ error: "department_in_use" });
  });

  return router;
}
