import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import type {
  ChatMessage,
  CreateDecisionInput,
  MessageEntity,
  ThreadSummary
} from "@hanmir/shared";
import { REACTION_EMOJI_ALLOWLIST } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";
import { realtime } from "../realtime";
import { auditLog } from "../audit";
import { notifyReplyNew } from "../notify";

function newMessageId(): string {
  return `m-${randomBytes(6).toString("hex")}`;
}

// Phase 11 — 부모 메시지 기준으로 thread chip 에 필요한 요약을 만든다.
// emitMessageThreadUpdated 의 payload. count 0 일 때 (모든 답글이 삭제되어
// 사라진 경우) chip 자체가 사라져야 하므로 그 case 도 dispatch.
async function buildThreadSummary(
  repos: Repositories,
  parentMessageId: string
): Promise<ThreadSummary | undefined> {
  const parent = await repos.messages.findById(parentMessageId);
  if (!parent) return undefined;
  return {
    parentMessageId: parent.id,
    roomId: parent.roomId,
    replyCount: parent.threadReplyCount ?? 0,
    lastReplyAt: parent.threadLastReplyAt,
    replyAvatars: parent.threadReplyAvatars ?? []
  };
}

const REACTION_EMOJI_SET = new Set<string>(REACTION_EMOJI_ALLOWLIST);

// Phase 10 M-4 — entity 형태 검증. rooms.ts 와 동일 규칙이지만 import
// 경계를 깨지 않기 위해 작게 재구현.
const VALID_ENTITY_TYPES: MessageEntity["type"][] = [
  "mention",
  "project_ref",
  "task_ref",
  "file_ref"
];

function sanitizeEntities(raw: unknown, body: string): MessageEntity[] {
  if (!Array.isArray(raw)) return [];
  const len = body.length;
  const out: MessageEntity[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (
      typeof o.type !== "string" ||
      !VALID_ENTITY_TYPES.includes(o.type as MessageEntity["type"])
    ) {
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
  out.sort((a, b) => a.offset - b.offset);
  return out;
}

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

  // ── Phase 11 — 스레드 답글 ───────────────────────────────────────────
  //
  // GET  /messages/:id/replies   부모 메시지의 답글 목록 (room 멤버만)
  // POST /messages/:id/replies   답글 작성 (room 멤버 + 부모 not deleted)
  //
  // 답글의 수정/삭제는 일반 PATCH /:id / DELETE /:id 가 처리하고, 라우트가
  // message.parentMessageId 를 보고 message:reply:* 로 emit 한다.

  router.get("/:id/replies", async (req, res) => {
    const access = await loadAccessibleMessage(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const me = req.currentUser!;
    const replies = await repos.messages.listReplies(access.message.id, me.id);
    res.json({ results: replies });
  });

  router.post("/:id/replies", async (req, res) => {
    const access = await loadAccessibleMessage(repos, req, res, req.params.id);
    if (!access.allowed) return;
    if (access.message.parentMessageId) {
      // 답글의 답글(중첩 스레드)은 본 버전에서 지원하지 않는다 — UI 가
      // 깊이 1만 가정. depth 2 가 가능하면 thread aggregate 가 부정확해진다.
      res.status(400).json({ error: "nested_reply_not_supported" });
      return;
    }
    if (access.message.isDeleted) {
      res.status(409).json({ error: "parent_deleted" });
      return;
    }
    const me = req.currentUser!;
    const body = typeof req.body?.body === "string" ? req.body.body : "";
    if (!body.trim()) {
      res.status(400).json({ error: "empty_message" });
      return;
    }
    const rawEntities = Array.isArray(req.body?.entities) ? req.body.entities : [];
    const entities = sanitizeEntities(rawEntities, body);

    const reply: ChatMessage = {
      id: newMessageId(),
      roomId: access.message.roomId,
      authorId: me.id,
      authorName: me.name,
      authorRole: `${me.position} · ${me.departmentName}`,
      avatarTone: me.avatarTone,
      initials: me.initials,
      body,
      createdAt: new Date().toISOString(),
      isMine: true,
      entities: entities.length > 0 ? entities : undefined,
      parentMessageId: access.message.id
    };
    const saved = await repos.messages.appendReply(access.message.id, reply);

    // 답글 본문 emit + 부모의 thread chip 갱신.
    realtime.emitMessageReplyNew(saved.roomId, access.message.id, saved);
    const summary = await buildThreadSummary(repos, access.message.id);
    if (summary) realtime.emitMessageThreadUpdated(summary);

    // 알림 — 부모 작성자 + 멘션 대상자만. 일반 메시지처럼 방 전체로
    // 보내지 않는다 (notify.ts 의 notifyReplyNew).
    void notifyReplyNew(repos, saved.roomId, access.message, saved);

    res.status(201).json(saved);
  });

  // ── Phase 11 — 이모지 반응 ───────────────────────────────────────────
  //
  // PUT    /messages/:id/reactions/:emoji   반응 추가 (idempotent)
  // DELETE /messages/:id/reactions/:emoji   반응 제거 (idempotent)
  //
  // 화이트리스트(REACTION_EMOJI_ALLOWLIST) 외 이모지는 415 거부. 삭제된
  // 메시지에는 새 반응을 박을 수 없지만 제거는 가능 (cleanup 용).

  router.put("/:id/reactions/:emoji", async (req, res) => {
    const access = await loadAccessibleMessage(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const emoji = decodeURIComponent(req.params.emoji);
    if (!REACTION_EMOJI_SET.has(emoji)) {
      res.status(415).json({ error: "unsupported_emoji" });
      return;
    }
    if (access.message.isDeleted) {
      res.status(409).json({ error: "message_deleted" });
      return;
    }
    const me = req.currentUser!;
    await repos.messageReactions.add(access.message.id, me.id, emoji);
    const reactions = await repos.messageReactions.listForMessage(
      access.message.id,
      me.id
    );
    realtime.emitMessageReactionUpdated({
      roomId: access.message.roomId,
      messageId: access.message.id,
      reactions
    });
    res.json({ ok: true, reactions });
  });

  router.delete("/:id/reactions/:emoji", async (req, res) => {
    const access = await loadAccessibleMessage(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const emoji = decodeURIComponent(req.params.emoji);
    if (!REACTION_EMOJI_SET.has(emoji)) {
      res.status(415).json({ error: "unsupported_emoji" });
      return;
    }
    const me = req.currentUser!;
    await repos.messageReactions.remove(access.message.id, me.id, emoji);
    const reactions = await repos.messageReactions.listForMessage(
      access.message.id,
      me.id
    );
    realtime.emitMessageReactionUpdated({
      roomId: access.message.roomId,
      messageId: access.message.id,
      reactions
    });
    res.json({ ok: true, reactions });
  });

  // GET /messages/:id/reactions — 반응 상세 (이모지별 누가 반응했는지).
  // 방 멤버 누구나 조회 가능 (loadAccessibleMessage 가 멤버십 검증).
  router.get("/:id/reactions", async (req, res) => {
    const access = await loadAccessibleMessage(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const details = await repos.messageReactions.listDetailForMessage(
      access.message.id
    );
    res.json(details);
  });

  // GET /messages/:id/read-status — 방 멤버(작성자 제외) 기준 읽음/안 읽음.
  // last_read 포인터 비교라 별도 read-receipt 테이블 없이 동작한다.
  router.get("/:id/read-status", async (req, res) => {
    const access = await loadAccessibleMessage(repos, req, res, req.params.id);
    if (!access.allowed) return;
    const status = await repos.messages.getReadStatus(access.message.id);
    if (!status) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(status);
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
    // Phase 11 — 답글이면 message:reply:updated 로 emit (drawer 가 patch
    // 한다). top-level 은 기존 message:updated.
    if (updated.parentMessageId) {
      realtime.emitMessageReplyUpdated(updated.roomId, updated.parentMessageId, updated);
    } else {
      realtime.emitMessageUpdated(updated.roomId, updated);
    }
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
    if (after) {
      if (after.parentMessageId) {
        // Phase 11 — 답글 삭제: drawer 패치 + 부모의 thread chip 갱신.
        realtime.emitMessageReplyDeleted(after.roomId, after.parentMessageId, after);
        const summary = await buildThreadSummary(repos, after.parentMessageId);
        if (summary) realtime.emitMessageThreadUpdated(summary);
      } else {
        realtime.emitMessageDeleted(after.roomId, after);
      }
    }
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

  // ── Phase 10 M-4 — 예약 전송 ─────────────────────────────────────────
  //
  // POST /messages/schedule        본인 예약 생성
  // GET  /messages/scheduled       본인 예약 목록 (sent/cancelled 제외)
  // DELETE /messages/scheduled/:id 작성자 또는 admin 만 취소
  //
  // 모든 path 가 1~2 segment 이라 PATCH /:id / DELETE /:id 패턴과 충돌
  // 없음. 단, /:id PATCH 가 "schedule" 같은 id 를 그대로 받지 않도록
  // 본 라우트들을 먼저 등록한다 (Express 는 등록 순서대로 매칭).

  router.post("/schedule", async (req, res) => {
    const me = req.currentUser!;
    const body = req.body as
      | {
          roomId?: unknown;
          content?: unknown;
          scheduledAt?: unknown;
          entities?: unknown;
          attachmentId?: unknown;
        }
      | undefined;
    const roomId =
      typeof body?.roomId === "string" && body.roomId.trim() ? body.roomId.trim() : "";
    const content =
      typeof body?.content === "string" ? body.content : "";
    const scheduledAtRaw =
      typeof body?.scheduledAt === "string" ? body.scheduledAt : "";
    const attachmentId =
      typeof body?.attachmentId === "string" && body.attachmentId.trim()
        ? body.attachmentId.trim()
        : undefined;

    if (!roomId) {
      res.status(400).json({ error: "roomId_required" });
      return;
    }
    if (!content.trim() && !attachmentId) {
      res.status(400).json({ error: "empty_message" });
      return;
    }
    const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      res.status(400).json({ error: "scheduledAt_invalid" });
      return;
    }
    // 클라이언트가 보낸 시각이 이미 과거면 거부. 약간의 clock skew 를
    // 허용 (5초) — 사용자가 "지금 + 1초" 같은 즉시 예약을 시도해도
    // 친절하게 받아준다.
    if (scheduledAt.getTime() < Date.now() - 5_000) {
      res.status(400).json({ error: "scheduledAt_in_past" });
      return;
    }

    // 멤버십 검증 — rooms.ts ensureRoomAccess 와 동일 규칙.
    const room = await repos.rooms.findById(roomId, me.id);
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const isAdmin = me.role === "admin" || me.role === "super_admin";
    if (!isAdmin && !room.members.some((m) => m.userId === me.id)) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // attachment 검증 — 본인이 업로드한 것이어야.
    if (attachmentId) {
      const file = await repos.files.findById(attachmentId);
      if (!file) {
        res.status(400).json({ error: "attachment_not_found" });
        return;
      }
      if (file.uploaderId !== me.id) {
        res.status(403).json({ error: "attachment_not_owned" });
        return;
      }
    }

    const entities = sanitizeEntities(body?.entities, content);
    const created = await repos.scheduledMessages.create(
      {
        roomId,
        content,
        scheduledAt: scheduledAt.toISOString(),
        entities,
        attachmentId
      },
      { id: me.id }
    );
    await auditLog(repos, req, {
      action: "message.schedule",
      targetType: "scheduled_message",
      targetId: created.id,
      targetLabel: content.slice(0, 80),
      meta: { roomId, scheduledAt: created.scheduledAt }
    });
    res.status(201).json(created);
  });

  router.get("/scheduled", async (req, res) => {
    const me = req.currentUser!;
    const roomIdFilter =
      typeof req.query.roomId === "string" && req.query.roomId.trim()
        ? req.query.roomId.trim()
        : undefined;
    // roomId 가 명시되면 멤버십 검증 (비멤버가 다른 방의 예약 목록을
    // 비어 있는 응답으로 추측하는 것까지는 막지 않지만, 적어도 본인의
    // 예약만 보여주므로 정보 누출은 없다).
    if (roomIdFilter) {
      const room = await repos.rooms.findById(roomIdFilter, me.id);
      if (!room) {
        res.json({ results: [] });
        return;
      }
      const isAdmin = me.role === "admin" || me.role === "super_admin";
      if (!isAdmin && !room.members.some((m) => m.userId === me.id)) {
        res.json({ results: [] });
        return;
      }
    }
    const list = await repos.scheduledMessages.listForUser(me.id, {
      roomId: roomIdFilter
    });
    res.json({ results: list });
  });

  router.delete("/scheduled/:id", async (req, res) => {
    const me = req.currentUser!;
    const target = await repos.scheduledMessages.findById(req.params.id);
    if (!target) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const isAdmin = me.role === "admin" || me.role === "super_admin";
    if (target.userId !== me.id && !isAdmin) {
      res.status(403).json({ error: "not_author_or_admin" });
      return;
    }
    if (target.status === "sent") {
      res.status(409).json({ error: "already_sent" });
      return;
    }
    const ok = await repos.scheduledMessages.cancel(req.params.id, new Date());
    if (!ok) {
      // 이미 보낸 직후 race — 한 번 더 검사해서 409 로 떨어뜨림.
      res.status(409).json({ error: "already_sent_or_cancelled" });
      return;
    }
    await auditLog(repos, req, {
      action:
        target.userId === me.id
          ? "message.schedule.cancel"
          : "message.schedule.cancel.by_admin",
      targetType: "scheduled_message",
      targetId: req.params.id,
      targetLabel: target.content.slice(0, 80),
      level: target.userId === me.id ? "info" : "warn",
      meta: { roomId: target.roomId, originalAuthorId: target.userId }
    });
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
