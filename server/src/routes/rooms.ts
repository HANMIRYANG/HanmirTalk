import { Router } from "express";
import type { ChatMessage } from "@hanmir/shared";
import { randomBytes } from "crypto";
import type { Repositories } from "../repositories/types";
import { requireAuth } from "../auth/middleware";

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

export function createRoomsRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const rooms = await repos.rooms.list(req.currentUser?.id);
    res.json(rooms);
  });

  router.get("/:id", async (req, res) => {
    const room = await repos.rooms.findById(req.params.id, req.currentUser?.id);
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(room);
  });

  router.get("/:roomId/messages", async (req, res) => {
    const room = await repos.rooms.findById(req.params.roomId, req.currentUser?.id);
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const messages = await repos.messages.listByRoom(req.params.roomId);
    res.json(messages);
  });

  router.get("/:roomId/pinned", async (req, res) => {
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
    const room = await repos.rooms.findById(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
    const room = await repos.rooms.findById(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
    res.json({ ok: true, pinned });
  });

  router.delete("/:roomId/pin", requireAuth, async (req, res) => {
    const room = await repos.rooms.findById(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await repos.messages.unpin(req.params.roomId);
    res.json({ ok: true });
  });

  router.post("/:roomId/messages", requireAuth, async (req, res) => {
    const room = await repos.rooms.findById(req.params.roomId);
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return;
    }
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
    res.status(201).json(saved);
  });

  return router;
}
