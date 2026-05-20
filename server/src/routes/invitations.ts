import { Router } from "express";
import { randomBytes } from "crypto";
import type { UserRole } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";
import { auditLog } from "../audit";
import { config } from "../config";
import { sendMail } from "../mailer";

// Phase 8 K-2 — 사용자 초대 / 가입 승인.
const VALID_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "project_owner",
  "member"
];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createInvitationsRouter(repos: Repositories): Router {
  const router = Router();
  const admins = requireRole("admin", "super_admin");

  router.get("/", admins, async (_req, res) => {
    res.json(await repos.invitations.list());
  });

  router.post("/", admins, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email =
      typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const role = b.role;
    const departmentId = typeof b.departmentId === "string" ? b.departmentId : "";

    if (!email || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: "email_invalid" });
      return;
    }
    if (typeof role !== "string" || !(VALID_ROLES as string[]).includes(role)) {
      res.status(400).json({ error: "role_invalid" });
      return;
    }
    if (!departmentId) {
      res.status(400).json({ error: "departmentId_required" });
      return;
    }
    const dept = await repos.departments.findById(departmentId);
    if (!dept) {
      res.status(400).json({ error: "department_not_found" });
      return;
    }
    // 이미 가입된 이메일이면 초대 불가.
    const existing = await repos.users.findByEmail(email);
    if (existing) {
      res.status(409).json({ error: "email_already_registered" });
      return;
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    const invitation = await repos.invitations.create({
      email,
      role,
      departmentId,
      token,
      expiresAt,
      invitedBy: { id: req.currentUser!.id }
    });

    await auditLog(repos, req, {
      action: "invitation.create",
      targetType: "invitation",
      targetId: invitation.id,
      targetLabel: email,
      meta: { role, departmentId }
    });

    // best-effort 메일 발송 — 실패해도 초대는 유효(admin이 URL 복사 가능).
    const acceptUrl = `${config.corsOrigin}/invite?token=${token}`;
    void sendMail({
      to: email,
      subject: "[한미르톡] 가입 초대",
      text:
        `한미르톡에 초대되었습니다. 아래 링크에서 가입을 완료해 주세요.\n\n` +
        `${acceptUrl}\n\n이 링크는 7일간 유효합니다.`
    });

    res.status(201).json(invitation);
  });

  router.delete("/:id", admins, async (req, res) => {
    const ok = await repos.invitations.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "invitation.revoke",
      targetType: "invitation",
      targetId: req.params.id,
      level: "warn"
    });
    res.json({ ok: true });
  });

  return router;
}
