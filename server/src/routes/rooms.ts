import { Router, type Request, type Response } from "express";
import type {
  ChatMessage,
  CreateRoomInput,
  Room,
  RoomType,
  UpdateRoomInput
} from "@hanmir/shared";
import { randomBytes } from "crypto";
import type { Repositories } from "../repositories/types";
import { requireAuth } from "../auth/middleware";
import { realtime } from "../realtime";
import { auditLog } from "../audit";

const VALID_ROOM_TYPE: RoomType[] = ["direct", "group", "department", "announcement", "project"];

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function parseCreateRoom(body: unknown): CreateRoomInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isString(b.name) || !b.name.trim()) return { error: "name_required" };
  if (b.type !== undefined) {
    if (!isString(b.type) || !VALID_ROOM_TYPE.includes(b.type as RoomType))
      return { error: "type_invalid" };
  }
  if (b.memberIds !== undefined && !isStringArray(b.memberIds))
    return { error: "memberIds_invalid" };
  if (b.description !== undefined && !isString(b.description))
    return { error: "description_invalid" };
  if (b.projectId !== undefined && !isString(b.projectId))
    return { error: "projectId_invalid" };
  return {
    name: b.name.trim(),
    type: isString(b.type) ? (b.type as RoomType) : undefined,
    description: isString(b.description) ? b.description : undefined,
    projectId: isString(b.projectId) ? b.projectId : undefined,
    memberIds: isStringArray(b.memberIds) ? b.memberIds : undefined
  };
}

function parseUpdateRoom(body: unknown): UpdateRoomInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const out: UpdateRoomInput = {};
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

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

// Phase 1 D-8 — authorization gate for single-room endpoints. Returns the
// room (so callers don't re-fetch) when access is granted, or sends an HTTP
// response and returns { allowed: false } when denied. Non-members get 404
// rather than 403 to avoid leaking room existence via probing.
async function ensureRoomAccess(
  repos: Repositories,
  req: Request,
  res: Response,
  roomId: string
): Promise<{ allowed: true; room: Room } | { allowed: false }> {
  const me = req.currentUser!;
  const room = await repos.rooms.findById(roomId, me.id);
  if (!room) {
    res.status(404).json({ error: "not_found" });
    return { allowed: false };
  }
  if (me.role === "admin" || me.role === "super_admin") {
    return { allowed: true, room };
  }
  if (!room.members.some((m) => m.userId === me.id)) {
    res.status(404).json({ error: "not_found" });
    return { allowed: false };
  }
  return { allowed: true, room };
}

export function createRoomsRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const me = req.currentUser!;
    const all = await repos.rooms.list(me.id);
    // Admins see every room (audit/oversight needs); regular users only see
    // rooms where they are a member, matching the single-room gate above.
    const visible =
      me.role === "admin" || me.role === "super_admin"
        ? all
        : all.filter((r) => r.members.some((m) => m.userId === me.id));
    res.json(visible);
  });

  router.get("/:id", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.id);
    if (!access.allowed) return;
    res.json(access.room);
  });

  router.get("/:roomId/messages", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    const messages = await repos.messages.listByRoom(req.params.roomId);
    res.json(messages);
  });

  router.get("/:roomId/pinned", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    const pinned = await repos.messages.getPinned(req.params.roomId);
    if (!pinned) {
      res.status(204).end();
      return;
    }
    res.json(pinned);
  });

  // Mark messages in this room as read up to `lastMessageId`. The client is
  // responsible for sending the latest visible id. No-op safe to repeat.
  router.post("/:roomId/read", requireAuth, async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    const lastMessageId =
      typeof req.body?.lastMessageId === "string" && req.body.lastMessageId
        ? req.body.lastMessageId
        : "";
    if (!lastMessageId) {
      res.status(400).json({ error: "lastMessageId_required" });
      return;
    }
    await repos.messages.markRead(req.params.roomId, req.currentUser!.id, lastMessageId);
    res.json({ ok: true });
  });

  // Single pinned message per room. Pin a different id to replace; DELETE
  // clears. Any authenticated user can pin in MVP — TODO: room-owner gate.
  router.post("/:roomId/pin", requireAuth, async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    const messageId =
      typeof req.body?.messageId === "string" && req.body.messageId
        ? req.body.messageId
        : "";
    if (!messageId) {
      res.status(400).json({ error: "messageId_required" });
      return;
    }
    const result = await repos.messages.pin(req.params.roomId, messageId);
    if (result === "room_not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (result === "message_not_in_room") {
      res.status(400).json({ error: "message_not_in_room" });
      return;
    }
    const pinned = await repos.messages.getPinned(req.params.roomId);
    realtime.emitRoomPinChanged(req.params.roomId, pinned ?? null);
    res.json({ ok: true, pinned });
  });

  router.delete("/:roomId/pin", requireAuth, async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    await repos.messages.unpin(req.params.roomId);
    realtime.emitRoomPinChanged(req.params.roomId, null);
    res.json({ ok: true });
  });

  router.post("/:roomId/messages", requireAuth, async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    const user = req.currentUser!;
    const body = typeof req.body?.body === "string" ? req.body.body : "";
    const attachmentId =
      typeof req.body?.attachmentId === "string" && req.body.attachmentId
        ? req.body.attachmentId
        : undefined;
    // Allow attachment-only messages (empty body) so users can share a file
    // without writing text.
    if (!body.trim() && !attachmentId) {
      res.status(400).json({ error: "empty_message" });
      return;
    }
    let attachment: ChatMessage["attachment"] | undefined;
    if (attachmentId) {
      const file = await repos.files.findById(attachmentId);
      if (!file) {
        res.status(400).json({ error: "attachment_not_found" });
        return;
      }
      if (file.uploaderId !== user.id) {
        // Prevent users from broadcasting other people's uploads.
        res.status(403).json({ error: "attachment_not_owned" });
        return;
      }
      attachment = {
        id: file.id,
        kind: file.kind,
        name: file.name,
        meta: file.size
      };
    }
    const message: ChatMessage = {
      id: newId("m"),
      roomId: req.params.roomId,
      authorId: user.id,
      authorName: user.name,
      authorRole: `${user.position} · ${user.departmentName}`,
      avatarTone: user.avatarTone,
      initials: user.initials,
      body,
      createdAt: new Date().toISOString(),
      isMine: true,
      attachment
    };
    const saved = await repos.messages.append(req.params.roomId, message, {
      attachmentId
    });
    realtime.emitMessageNew(req.params.roomId, saved);
    res.status(201).json(saved);
  });

  // ── Phase 4 G-1 — room CUD + membership + mute + leave + direct ──────

  // POST /rooms — create a new room. Caller becomes owner.
  router.post("/", async (req, res) => {
    const parsed = parseCreateRoom(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const me = req.currentUser!;
    // Validate that all memberIds exist and are active. Silent skip of
    // unknown ids would surprise the caller; refuse loudly instead.
    for (const uid of parsed.memberIds ?? []) {
      const u = await repos.users.findById(uid);
      if (!u || u.isActive === false) {
        res.status(400).json({ error: "member_not_found", invalidUserId: uid });
        return;
      }
    }
    // If projectId is set, caller must be an admin or project member.
    if (parsed.projectId) {
      const project = await repos.projects.findById(parsed.projectId);
      if (!project) {
        res.status(400).json({ error: "project_not_found" });
        return;
      }
      const isAdmin = me.role === "admin" || me.role === "super_admin";
      if (!isAdmin && !project.memberIds.includes(me.id)) {
        res.status(403).json({ error: "not_a_project_member" });
        return;
      }
    }
    const created = await repos.rooms.create(parsed, { id: me.id });
    await auditLog(repos, req, {
      action: "room.create",
      targetType: "room",
      targetId: created.id,
      targetLabel: created.name,
      meta: { type: created.type, memberCount: created.members.length, projectId: created.projectId }
    });
    realtime.emitRoomCreated(created);
    res.status(201).json(created);
  });

  // POST /rooms/direct — find or create the DM room between caller and
  // {userId}. Idempotent — repeated calls return the same room.
  router.post("/direct", async (req, res) => {
    const me = req.currentUser!;
    const userId = isString(req.body?.userId) ? (req.body.userId as string).trim() : "";
    if (!userId) {
      res.status(400).json({ error: "userId_required" });
      return;
    }
    if (userId === me.id) {
      res.status(400).json({ error: "cannot_dm_self" });
      return;
    }
    const target = await repos.users.findById(userId);
    if (!target || target.isActive === false) {
      res.status(400).json({ error: "user_not_found" });
      return;
    }
    const wasNew = !(await findExistingDirect(repos, me.id, userId));
    const room = await repos.rooms.findOrCreateDirect(me.id, userId);
    if (wasNew) {
      await auditLog(repos, req, {
        action: "room.direct.create",
        targetType: "room",
        targetId: room.id,
        targetLabel: `${me.name} ↔ ${target.name}`
      });
      realtime.emitRoomCreated(room);
    }
    res.status(wasNew ? 201 : 200).json(room);
  });

  // PATCH /rooms/:id — edit name/description. Members only.
  router.patch("/:id", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const parsed = parseUpdateRoom(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updated = await repos.rooms.update(req.params.id, parsed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "room.update",
      targetType: "room",
      targetId: updated.id,
      targetLabel: updated.name,
      meta: parsed
    });
    realtime.emitRoomUpdated(updated);
    res.json(updated);
  });

  // POST /rooms/:roomId/members — add a user. Members can invite others.
  router.post("/:roomId/members", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    if (access.room.type === "direct") {
      res.status(400).json({ error: "direct_room_fixed_membership" });
      return;
    }
    const userId = isString(req.body?.userId) ? (req.body.userId as string).trim() : "";
    if (!userId) {
      res.status(400).json({ error: "userId_required" });
      return;
    }
    const target = await repos.users.findById(userId);
    if (!target || target.isActive === false) {
      res.status(400).json({ error: "user_not_found" });
      return;
    }
    const updated = await repos.rooms.addMember(req.params.roomId, userId);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "room.member.add",
      targetType: "room",
      targetId: updated.id,
      targetLabel: updated.name,
      meta: { addedUserId: userId, addedUserName: target.name }
    });
    realtime.emitRoomUpdated(updated);
    res.status(201).json(updated);
  });

  // DELETE /rooms/:roomId/members/:userId — remove. Caller must be an
  // existing member; admins can remove anyone, others can only remove
  // themselves (which is what /leave is for, so this is for kicks).
  router.delete("/:roomId/members/:userId", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    const me = req.currentUser!;
    const isAdmin = me.role === "admin" || me.role === "super_admin";
    const target = req.params.userId;
    if (!isAdmin && target !== me.id) {
      res.status(403).json({ error: "cannot_remove_others" });
      return;
    }
    if (access.room.type === "direct") {
      res.status(400).json({ error: "direct_room_fixed_membership" });
      return;
    }
    const targetUser = await repos.users.findById(target);
    const updated = await repos.rooms.removeMember(req.params.roomId, target);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: target === me.id ? "room.member.self_remove" : "room.member.remove",
      targetType: "room",
      targetId: updated.id,
      targetLabel: updated.name,
      level: target === me.id ? "info" : "warn",
      meta: { removedUserId: target, removedUserName: targetUser?.name }
    });
    realtime.emitRoomUpdated(updated);
    res.json(updated);
  });

  // POST /rooms/:roomId/mute — mute notifications for the caller in this
  // room. DELETE on the same path un-mutes. Per-user via
  // room_members.notification_enabled.
  router.post("/:roomId/mute", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    const updated = await repos.rooms.setMute(req.params.roomId, req.currentUser!.id, true);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  });

  router.delete("/:roomId/mute", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    const updated = await repos.rooms.setMute(req.params.roomId, req.currentUser!.id, false);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  });

  // POST /rooms/:roomId/leave — caller exits the room. Last member ⇒
  // soft archive (is_active=false in PG; memory removes from active list).
  router.post("/:roomId/leave", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    if (access.room.type === "direct") {
      res.status(400).json({ error: "cannot_leave_direct_room" });
      return;
    }
    const me = req.currentUser!;
    const result = await repos.rooms.leave(req.params.roomId, me.id);
    if (!result.ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "room.leave",
      targetType: "room",
      targetId: req.params.roomId,
      targetLabel: access.room.name,
      meta: { archived: result.archived }
    });
    realtime.emitRoomMembershipChanged(req.params.roomId, {
      kind: "leave",
      userId: me.id,
      archived: result.archived
    });
    res.json({ ok: true, archived: result.archived });
  });

  return router;
}

// Helper for /rooms/direct to detect whether the room already existed
// (so we set 200 vs 201 and only audit on first creation). Memory + PG
// adapters both return the existing room if found, but we need to know
// up front whether it pre-existed.
async function findExistingDirect(
  repos: Repositories,
  userIdA: string,
  userIdB: string
): Promise<Room | undefined> {
  const all = await repos.rooms.list(userIdA);
  return all.find(
    (r) =>
      r.type === "direct" &&
      r.members.length === 2 &&
      r.members.some((m) => m.userId === userIdA) &&
      r.members.some((m) => m.userId === userIdB)
  );
}
