import { Router, type Request, type Response } from "express";
import type {
  ChatMessage,
  CreateRoomInput,
  MessageEntity,
  Room,
  RoomType,
  UpdateRoomInput
} from "@hanmir/shared";
import { randomBytes } from "crypto";
import type { Repositories } from "../repositories/types";
import { requireAuth } from "../auth/middleware";
import { realtime } from "../realtime";
import { auditLog } from "../audit";
import { notifyMessageNew } from "../notify";

const VALID_ROOM_TYPE: RoomType[] = ["direct", "group", "department", "announcement", "project"];

// 1:1 대화방은 보는 사람 기준 상대방 이름으로 표시한다. DB 의 name
// ("1:1 대화")은 그대로 두고 응답 DTO 만 바꾼다 — 같은 방이라도 두
// 참여자에게 서로 다른 이름이 보여야 하므로 저장 시점에 박을 수 없다.
// 멤버가 아닌 관리자(전체 방 열람)에게는 "A ↔ B" 형태로 표시.
async function withDirectDisplayNames(
  repos: Repositories,
  rooms: Room[],
  viewerId: string
): Promise<Room[]> {
  if (!rooms.some((r) => r.type === "direct")) return rooms;
  const users = await repos.users.list();
  const userById = new Map(users.map((u) => [u.id, u] as const));
  return rooms.map((room) => {
    if (room.type !== "direct") return room;
    const isMember = room.members.some((m) => m.userId === viewerId);
    if (isMember) {
      const other = room.members.find((m) => m.userId !== viewerId);
      const otherUser = other ? userById.get(other.userId) : undefined;
      if (!otherUser) return room;
      return { ...room, name: otherUser.name, avatarLabel: otherUser.name.slice(0, 2) };
    }
    const names = room.members
      .map((m) => userById.get(m.userId)?.name)
      .filter((n): n is string => Boolean(n));
    if (names.length === 0) return room;
    return { ...room, name: names.join(" ↔ ") };
  });
}

async function withDirectDisplayName(
  repos: Repositories,
  room: Room,
  viewerId: string
): Promise<Room> {
  const [out] = await withDirectDisplayNames(repos, [room], viewerId);
  return out;
}

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
    res.json(await withDirectDisplayNames(repos, visible, me.id));
  });

  router.get("/:id", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.id);
    if (!access.allowed) return;
    res.json(await withDirectDisplayName(repos, access.room, req.currentUser!.id));
  });

  router.get("/:roomId/messages", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    // 페이지네이션 — ?limit=100 이면 최신 100개, ?before=<messageId> 는
    // 그보다 오래된 윈도우 ("이전 메시지 보기"). 둘 다 없으면 기존처럼
    // 전체 반환 (하위 호환).
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.floor(rawLimit), 1), 200)
      : undefined;
    const beforeId =
      typeof req.query.before === "string" && req.query.before
        ? req.query.before
        : undefined;
    // Phase 11 — viewerUserId 를 넘겨 reactedByMe 가 채워지도록.
    // listByRoom 은 자동으로 top-level 만 반환 + thread aggregate 포함.
    const messages = await repos.messages.listByRoom(
      req.params.roomId,
      req.currentUser!.id,
      limit || beforeId ? { limit, beforeId } : undefined
    );
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
    // Phase 5 H-1 — entities[]는 메시지 본문에 박힌 mention/ref 토큰.
    // 클라이언트가 보낸 것 그대로 신뢰하지 않고 형태 검증한다 (label/id/
    // offset/length가 본문 범위 안에 있어야 함). 본문에 박힌 텍스트와
    // entity label이 일치하는지까지 강제하면 UI 마찰이 크니 위치 범위만.
    const rawEntities = Array.isArray(req.body?.entities) ? req.body.entities : [];
    const entities = sanitizeEntities(rawEntities, body);
    // Phase 5 H-5 — AI 메시지 영속화. AiCommandModal 의 [채팅에 삽입] 가
    // 보내는 메타데이터. source_message_ids 컬럼이 UUID[] 이라(마이그 013)
    // 임의 문자열을 그대로 INSERT 하면 PG 가 500 을 던지므로 라우트
    // 레이어에서 엄격 검증한다. aiCommand 도 5종 화이트리스트.
    const aiGenerated = req.body?.aiGenerated === true;
    const aiCommand = sanitizeAiCommand(req.body?.aiCommand);
    const sourceMessageIds = sanitizeSourceMessageIds(req.body?.sourceMessageIds);
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
      attachment,
      entities: entities.length > 0 ? entities : undefined,
      // aiGenerated 만 단독으로 들어와도 그대로 마킹 — aiCommand 가
      // 화이트리스트 통과 못 한 경우엔 undefined 로 떨어진다.
      aiGenerated: aiGenerated || undefined,
      aiCommand,
      sourceMessageIds:
        sourceMessageIds.length > 0 ? sourceMessageIds : undefined
    };
    const saved = await repos.messages.append(req.params.roomId, message, {
      attachmentId
    });
    realtime.emitMessageNew(req.params.roomId, saved);
    // Phase 6 I-2 — 알림은 응답을 막지 않도록 fire-and-forget.
    void notifyMessageNew(repos, req.params.roomId, saved);
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
    res
      .status(wasNew ? 201 : 200)
      .json(await withDirectDisplayName(repos, room, me.id));
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
    // 남은 멤버들에게는 멤버 목록 갱신 신호.
    realtime.emitRoomUpdated(updated);
    // 추방된 사용자 본인에게도 user:<id> 채널로 보냄. emitRoomUpdated는
    // 새 members 배열을 순회하기 때문에 (이미 빠진) 본인은 못 받음 →
    // 자발적 leave와 동일하게 emitRoomMembershipChanged를 별도 호출해서
    // 본인 ChatList가 socket 한 번에 갱신되도록.
    realtime.emitRoomMembershipChanged(req.params.roomId, {
      kind: "leave",
      userId: target
    });
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

  // POST /rooms/:roomId/favorite — 채팅 목록 "고정된 대화"에 추가 (per-user,
  // room_members.pinned). DELETE 가 해제. 메시지 고정(/:roomId/pin)과 별개.
  router.post("/:roomId/favorite", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    const updated = await repos.rooms.setListPin(req.params.roomId, req.currentUser!.id, true);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  });

  router.delete("/:roomId/favorite", async (req, res) => {
    const access = await ensureRoomAccess(repos, req, res, req.params.roomId);
    if (!access.allowed) return;
    const updated = await repos.rooms.setListPin(req.params.roomId, req.currentUser!.id, false);
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

// Phase 5 H-1 — entity[]가 message body 범위 안의 정상 형태인지 검증.
// 형태 안 맞는 항목은 silent drop (전체 거부보다 UX 친화적). 본문 텍스트
// 와 label 일치는 강제하지 않음 — 클라이언트가 자유롭게 토큰 형식을
// 정할 수 있게.
const VALID_ENTITY_TYPES: MessageEntity["type"][] = [
  "mention",
  "project_ref",
  "task_ref",
  "file_ref"
];

// Phase 5 H-5 — AI 명령 5종 화이트리스트. 그 외 값은 silent drop 되어
// 메시지가 일반 메시지로 저장된다 (강제 400 보다 UX 친화적).
const VALID_AI_COMMANDS = new Set([
  "chat-summary",
  "extract-tasks",
  "extract-decisions",
  "draft-notice",
  "minutes"
]);

function sanitizeAiCommand(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return VALID_AI_COMMANDS.has(value) ? value : undefined;
}

// 마이그 013 의 source_message_ids 컬럼은 UUID[]. 임의 문자열이 들어가면
// PG 가 invalid_text_representation (22P02) 으로 500 을 던지므로 라우트에서
// 막는다. 메시지 id 패턴(m-<hex>)은 메모리 어댑터용이고 PG insert 시점엔
// row 의 PK 가 별개 UUID 로 발급되므로, 여기선 표준 UUID v1~v5 패턴만 허용.
// 한 메시지에 200개 이상 source 가 붙는 시나리오는 비현실적 — DoS 방지를
// 겸해 상한 cap.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SOURCE_IDS = 200;

function sanitizeSourceMessageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    if (!UUID_RE.test(v)) continue;
    out.push(v.toLowerCase());
    if (out.length >= MAX_SOURCE_IDS) break;
  }
  return out;
}

function sanitizeEntities(raw: unknown[], body: string): MessageEntity[] {
  const len = body.length;
  const out: MessageEntity[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.type !== "string" || !VALID_ENTITY_TYPES.includes(o.type as MessageEntity["type"])) {
      continue;
    }
    if (typeof o.id !== "string" || !o.id.trim()) continue;
    if (typeof o.label !== "string") continue;
    if (typeof o.offset !== "number" || !Number.isInteger(o.offset)) continue;
    if (typeof o.length !== "number" || !Number.isInteger(o.length)) continue;
    if (o.offset < 0 || o.length <= 0) continue;
    if (o.offset + o.length > len) continue;
    out.push({
      type: o.type as MessageEntity["type"],
      id: o.id.trim(),
      label: o.label,
      offset: o.offset,
      length: o.length
    });
  }
  // Sort by offset for renderer convenience.
  out.sort((a, b) => a.offset - b.offset);
  return out;
}
