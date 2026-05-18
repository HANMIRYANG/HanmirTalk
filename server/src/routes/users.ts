import { Router } from "express";
import type { CreateUserInput, UpdateUserInput, User, UserRole } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";
import { auditLog } from "../audit";

const VALID_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "project_owner",
  "member"
];

const VALID_AVATAR_TONES: NonNullable<User["avatarTone"]>[] = [
  "default",
  "orange",
  "green",
  "purple",
  "gray"
];

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isValidAvatarTone(value: unknown): value is NonNullable<User["avatarTone"]> {
  return isString(value) && (VALID_AVATAR_TONES as readonly string[]).includes(value);
}

function parseCreateUserInput(body: unknown): CreateUserInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isString(b.name) || !b.name.trim()) return { error: "name_required" };
  if (!isString(b.email) || !b.email.trim()) return { error: "email_required" };
  if (!isString(b.departmentId) || !b.departmentId.trim())
    return { error: "departmentId_required" };
  if (!isString(b.position)) return { error: "position_required" };
  if (!isString(b.role) || !VALID_ROLES.includes(b.role as UserRole))
    return { error: "role_invalid" };
  if (b.avatarTone !== undefined && !isValidAvatarTone(b.avatarTone))
    return { error: "avatarTone_invalid" };
  return {
    name: b.name.trim(),
    email: b.email.trim(),
    departmentId: b.departmentId.trim(),
    position: b.position,
    role: b.role as UserRole,
    phone: isString(b.phone) ? b.phone : undefined,
    avatarTone: isValidAvatarTone(b.avatarTone) ? b.avatarTone : undefined,
    initials: isString(b.initials) ? b.initials : undefined,
    password: isString(b.password) ? b.password : undefined
  };
}

function parseUpdateUserInput(body: unknown): UpdateUserInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const out: UpdateUserInput = {};
  if (b.name !== undefined) {
    if (!isString(b.name) || !b.name.trim()) return { error: "name_invalid" };
    out.name = b.name.trim();
  }
  if (b.email !== undefined) {
    if (!isString(b.email) || !b.email.trim()) return { error: "email_invalid" };
    // Storage keeps original casing (trim only); duplicate check downstream is
    // case-insensitive via findByEmail.
    out.email = b.email.trim();
  }
  if (b.departmentId !== undefined) {
    if (!isString(b.departmentId) || !b.departmentId.trim())
      return { error: "departmentId_invalid" };
    out.departmentId = b.departmentId.trim();
  }
  if (b.position !== undefined) {
    if (!isString(b.position)) return { error: "position_invalid" };
    out.position = b.position;
  }
  if (b.role !== undefined) {
    if (!isString(b.role) || !VALID_ROLES.includes(b.role as UserRole))
      return { error: "role_invalid" };
    out.role = b.role as UserRole;
  }
  if (b.phone !== undefined) {
    if (!isString(b.phone)) return { error: "phone_invalid" };
    out.phone = b.phone;
  }
  if (b.avatarTone !== undefined) {
    if (!isValidAvatarTone(b.avatarTone)) return { error: "avatarTone_invalid" };
    out.avatarTone = b.avatarTone;
  }
  if (b.initials !== undefined) {
    if (!isString(b.initials)) return { error: "initials_invalid" };
    out.initials = b.initials;
  }
  return out;
}

export function createUsersRouter(repos: Repositories): Router {
  const router = Router();
  const adminOnly = requireRole("admin", "super_admin");

  router.get("/", async (_req, res) => {
    const users = await repos.users.list();
    res.json(users);
  });

  router.get("/:id", async (req, res) => {
    const user = await repos.users.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(user);
  });

  router.post("/", adminOnly, async (req, res) => {
    const parsed = parseCreateUserInput(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const existing = await repos.users.findByEmail(parsed.email);
    if (existing) {
      res.status(409).json({ error: "email_in_use" });
      return;
    }
    const department = await repos.departments.findById(parsed.departmentId);
    if (!department) {
      res.status(400).json({ error: "department_not_found" });
      return;
    }
    const user = await repos.users.create(parsed);
    await auditLog(repos, req, {
      action: "user.create",
      targetType: "user",
      targetId: user.id,
      targetLabel: user.email,
      meta: { role: user.role, departmentId: user.departmentId }
    });
    res.status(201).json(user);
  });

  router.patch("/:id", adminOnly, async (req, res) => {
    const parsed = parseUpdateUserInput(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const target = await repos.users.findById(req.params.id);
    if (!target) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (parsed.email !== undefined) {
      const owner = await repos.users.findByEmail(parsed.email);
      // Allow updates that keep the user's own (possibly re-cased) email.
      if (owner && owner.id !== target.id) {
        res.status(409).json({ error: "email_in_use" });
        return;
      }
    }
    if (parsed.departmentId !== undefined) {
      const department = await repos.departments.findById(parsed.departmentId);
      if (!department) {
        res.status(400).json({ error: "department_not_found" });
        return;
      }
    }
    const updated = await repos.users.update(req.params.id, parsed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "user.update",
      targetType: "user",
      targetId: updated.id,
      targetLabel: updated.email,
      meta: parsed
    });
    res.json(updated);
  });

  router.patch("/:id/deactivate", adminOnly, async (req, res) => {
    const updated = await repos.users.deactivate(req.params.id);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "user.deactivate",
      targetType: "user",
      targetId: updated.id,
      targetLabel: updated.email,
      level: "warn"
    });
    res.json(updated);
  });

  return router;
}
