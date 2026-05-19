import { Router, type Request, type Response } from "express";
import type { CreateDecisionInput } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";
import { realtime } from "../realtime";
import { auditLog } from "../audit";

// Phase 2 E-1 — single-message endpoints. Mounted at /api/v1/messages by
// app.ts. Append (POST) lives under /rooms/:roomId/messages because it's
// tied to a room; edit/delete are message-id-scoped so they live here.
//
// Membership: instead of duplicating ensureRoomAccess we look up the
// message, then the room, then check membership the same way rooms.ts
// does. Non-members get 404 to hide existence.

async function loadAccessibleMessage(
  repos: Repositories,
  req: Request,
  res: Response,
  messageId: string
): Promise<
  | { allowed: true; message: import("@hanmir/shared").ChatMessage; isAdmin: boolean }
  | { allowed: false }
> {
  const me = req.currentUser!;
  const message = await repos.messages.findById(messageId);
  if (!message) {
    res.status(404).json({ error: "not_found" });
    return { allowed: false };
  }
  const isAdmin = me.role === "admin" || me.role === "super_admin";
  if (isAdmin) return { allowed: true, message, isAdmin };
  const room = await repos.rooms.findById(message.roomId, me.id);
  if (!room || !room.members.some((m) => m.userId === me.id)) {
    res.status(404).json({ error: "not_found" });
    return { allowed: false };
  }
  return { allowed: true, message, isAdmin };
}

export function createMessagesRouter(repos: Repositories): Router {
  const router = Router();

  // GET /messages/search?q=&roomId=&limit= — substring search. Mounted
  // before /:id so Express doesn't treat "search" as an id.
  router.get("/search", async (req, res) => {
    const me = req.currentUser!;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2) {
      // Two-char minimum avoids accidental "list everything" queries.
      res.json({ results: [] });
      return;
    }
    const roomIdFilter = typeof req.query.roomId === "string" ? req.query.roomId : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);

    // Compute the room scope the caller can see. Admins get everything;
    // everyone else gets their member rooms (matching the rooms.ts list
    // gate). If roomId filter is set we intersect it against the allowed
    // set so a non-member can't probe via the search endpoint either.
    const allRooms = await repos.rooms.list(me.id);
    const isAdmin = me.role === "admin" || me.role === "super_admin";
    let allowed = isAdmin
      ? allRooms.map((r) => r.id)
      : allRooms.filter((r) => r.members.some((m) => m.userId === me.id)).map((r) => r.id);
    if (roomIdFilter) {
      allowed = allowed.filter((id) => id === roomIdFilter);
    }
    if (allowed.length === 0) {
      res.json({ results: [] });
      return;
    }
    const results = await repos.messages.search({ q, roomIds: allowed, limit });
    res.json({ results });
  });

  // PATCH /messages/:id — edit body. Author only (admins cannot rewrite
  // other people's messages; they can soft-delete via DELETE which keeps
  // a tombstone).
  router.patch("/:id", async (req, res) => {
    const access = await loadAccessibleMessage(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const me = req.currentUser!;
    if (access.message.authorId !== me.id) {
      res.status(403).json({ error: "not_author" });
      return;
    }
    if (access.message.isDeleted) {
      res.status(409).json({ error: "already_deleted" });
      return;
    }
    const body = typeof req.body?.body === "string" ? req.body.body : "";
    const trimmed = body.trim();
    if (!trimmed) {
      // We only allow editing the text; attachment-only messages stay as
      // they are. If the user wants to remove a message entirely they
      // should DELETE, not edit-to-empty.
      res.status(400).json({ error: "empty_body" });
      return;
    }
    if (trimmed === access.message.body) {
      // No-op edits don't deserve a new edited_at timestamp.
      res.json(access.message);
      return;
    }
    const updated = await repos.messages.updateBody(req.params.id, trimmed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    realtime.emitMessageUpdated(updated.roomId, updated);
    res.json(updated);
  });

  // DELETE /messages/:id — soft delete. Author OR admin/super_admin. The
  // body is then masked by the repository layer on subsequent reads.
  router.delete("/:id", async (req, res) => {
    const access = await loadAccessibleMessage(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const me = req.currentUser!;
    if (access.message.authorId !== me.id && !access.isAdmin) {
      res.status(403).json({ error: "not_author_or_admin" });
      return;
    }
    if (access.message.isDeleted) {
      // Idempotent — already deleted, just return success.
      res.json({ ok: true });
      return;
    }
    const ok = await repos.messages.softDelete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    // Re-fetch so we emit the masked shape exactly as listByRoom would
    // surface it (body="삭제된 메시지입니다", attachment stripped).
    const after = await repos.messages.findById(req.params.id);
    if (after) realtime.emitMessageDeleted(after.roomId, after);
    if (access.isAdmin && access.message.authorId !== me.id) {
      // Admin deleting someone else's message is a moderation action
      // worth surfacing in the audit log; author self-delete is routine.
      await auditLog(repos, req, {
        action: "message.delete.by_admin",
        targetType: "message",
        targetId: req.params.id,
        targetLabel: access.message.body.slice(0, 80),
        level: "warn",
        meta: { roomId: access.message.roomId, originalAuthorId: access.message.authorId }
      });
    }
    res.json({ ok: true });
  });

  // POST /messages/:messageId/create-decision — convert a chat message
  // into a project decision. The source message's roomId must belong to a
  // project (rooms.projectId set); writer role required.
  router.post(
    "/:messageId/create-decision",
    requireRole("admin", "super_admin", "manager", "project_owner"),
    async (req, res) => {
      const access = await loadAccessibleMessage(repos, req, res, req.params.messageId);
      if (!access.allowed) return;
      if (access.message.isDeleted) {
        res.status(409).json({ error: "source_deleted" });
        return;
      }
      const room = await repos.rooms.findById(access.message.roomId, req.currentUser!.id);
      if (!room?.projectId) {
        res.status(400).json({ error: "source_room_not_project_bound" });
        return;
      }
      // Caller must also be a member of that project (or admin) — the
      // /projects/:id/decisions endpoint enforces this; mirror here.
      const project = await repos.projects.findById(room.projectId);
      if (!project) {
        res.status(404).json({ error: "project_not_found" });
        return;
      }
      const me = req.currentUser!;
      const isAdmin = me.role === "admin" || me.role === "super_admin";
      if (!isAdmin && !project.memberIds.includes(me.id)) {
        res.status(403).json({ error: "not_a_project_member" });
        return;
      }
      const body = req.body as
        | { title?: unknown; content?: unknown; decisionDate?: unknown }
        | undefined;
      const title = typeof body?.title === "string" && body.title.trim()
        ? body.title.trim()
        : access.message.body.split("\n")[0]?.slice(0, 80) || "(제목 없음)";
      const content = typeof body?.content === "string" && body.content.trim()
        ? body.content.trim()
        : access.message.body;
      const decisionDate = typeof body?.decisionDate === "string"
        ? body.decisionDate.trim() || undefined
        : undefined;
      const input: CreateDecisionInput = {
        title,
        content,
        decisionDate,
        sourceMessageId: access.message.id
      };
      const created = await repos.decisions.create(room.projectId, input, { id: me.id });
      await auditLog(repos, req, {
        action: "decision.create.from_message",
        targetType: "decision",
        targetId: created.id,
        targetLabel: created.title,
        meta: {
          projectId: room.projectId,
          sourceMessageId: access.message.id,
          sourceRoomId: room.id
        }
      });
      realtime.emitDecisionNew(room.projectId, created);
      res.status(201).json(created);
    }
  );

  return router;
}
