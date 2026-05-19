import { Router } from "express";
import type { UpdateNotificationSettingsInput } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";

// Phase 6 I-3 — per-user notification inbox + settings endpoints.
// 모두 본인 데이터만 접근. admin이라도 다른 사람 inbox는 못 봄 (정책 결정).

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isStringBoolMap(v: unknown): v is Record<string, boolean> {
  if (!v || typeof v !== "object") return false;
  return Object.values(v).every((x) => typeof x === "boolean");
}

function parseSettingsUpdate(
  body: unknown
): UpdateNotificationSettingsInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const out: UpdateNotificationSettingsInput = {};
  if (b.allEnabled !== undefined) {
    if (!isBool(b.allEnabled)) return { error: "allEnabled_invalid" };
    out.allEnabled = b.allEnabled;
  }
  if (b.perRoom !== undefined) {
    if (!isStringBoolMap(b.perRoom)) return { error: "perRoom_invalid" };
    out.perRoom = b.perRoom;
  }
  if (b.perProject !== undefined) {
    if (!isStringBoolMap(b.perProject)) return { error: "perProject_invalid" };
    out.perProject = b.perProject;
  }
  if (b.webPushEnabled !== undefined) {
    if (!isBool(b.webPushEnabled)) return { error: "webPushEnabled_invalid" };
    out.webPushEnabled = b.webPushEnabled;
  }
  if (b.browserEnabled !== undefined) {
    if (!isBool(b.browserEnabled)) return { error: "browserEnabled_invalid" };
    out.browserEnabled = b.browserEnabled;
  }
  return out;
}

export function createNotificationsRouter(repos: Repositories): Router {
  const router = Router();

  // GET /notifications?unread=true&limit=20 — inbox 목록
  router.get("/", async (req, res) => {
    const me = req.currentUser!;
    const unreadOnly = req.query.unread === "true";
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
    const list = await repos.notifications.listForUser(me.id, { unreadOnly, limit });
    res.json(list);
  });

  // GET /notifications/unread-count — Topbar 종 아이콘 배지용
  // 전체 inbox를 fetch하지 않고 카운트만 가져오는 light endpoint.
  router.get("/unread-count", async (req, res) => {
    const me = req.currentUser!;
    const count = await repos.notifications.unreadCount(me.id);
    res.json({ count });
  });

  // POST /notifications/:id/read — 개별 read mark
  router.post("/:id/read", async (req, res) => {
    const me = req.currentUser!;
    const updated = await repos.notifications.markRead(req.params.id, me.id);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  });

  // POST /notifications/read-all — 모두 읽음
  router.post("/read-all", async (req, res) => {
    const me = req.currentUser!;
    const result = await repos.notifications.markAllRead(me.id);
    res.json(result);
  });

  return router;
}

export function createNotificationSettingsRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const me = req.currentUser!;
    const settings = await repos.notifications.getSettings(me.id);
    res.json(settings);
  });

  router.patch("/", async (req, res) => {
    const me = req.currentUser!;
    const parsed = parseSettingsUpdate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updated = await repos.notifications.updateSettings(me.id, parsed);
    res.json(updated);
  });

  return router;
}
