import { Router, type Request, type Response } from "express";
import type { ChatMessage } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import {
  isAiEnabled,
  summarize,
  extractTasks,
  extractDecisions,
  draftNotice,
  minutes
} from "../ai/anthropic";
import { config } from "../config";
import { auditLog } from "../audit";

// Phase 5 H-4 — AI command endpoints. All accept { roomId, scope }
// and return { result, usage }. `scope` controls which slice of the
// room's history feeds the model:
//   "recent20" — last 20 non-deleted messages
//   "today"    — today's non-deleted messages (server clock day)
//   "thread"   — placeholder; treats same as recent20 until threads land
//   "messageIds" — explicit list { messageIds: string[] }
//
// Rate limit: per-user, in-memory token bucket. 5 requests/minute and
// 30 requests/day. Survives restarts? No — memory only, which is fine
// because restart implies short downtime and cap resets are not
// security-critical (the daily token cap is the real cost guard).

type Scope = "recent20" | "today" | "thread" | "messageIds";

interface RateBucket {
  minuteResetAt: number;
  minuteCount: number;
  dayResetAt: number;
  dayCount: number;
  tokensToday: number;
}

const buckets = new Map<string, RateBucket>();
const PER_MINUTE = 5;
const PER_DAY = 30;
const ONE_MIN = 60_000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function bucketFor(userId: string): RateBucket {
  const now = Date.now();
  let b = buckets.get(userId);
  if (!b) {
    b = {
      minuteResetAt: now + ONE_MIN,
      minuteCount: 0,
      dayResetAt: now + ONE_DAY,
      dayCount: 0,
      tokensToday: 0
    };
    buckets.set(userId, b);
    return b;
  }
  if (now >= b.minuteResetAt) {
    b.minuteResetAt = now + ONE_MIN;
    b.minuteCount = 0;
  }
  if (now >= b.dayResetAt) {
    b.dayResetAt = now + ONE_DAY;
    b.dayCount = 0;
    b.tokensToday = 0;
  }
  return b;
}

function checkRate(userId: string): { ok: true } | { ok: false; reason: string } {
  const b = bucketFor(userId);
  if (b.minuteCount >= PER_MINUTE) return { ok: false, reason: "rate_per_minute" };
  if (b.dayCount >= PER_DAY) return { ok: false, reason: "rate_per_day" };
  if (config.aiDailyTokenLimit > 0 && b.tokensToday >= config.aiDailyTokenLimit) {
    return { ok: false, reason: "token_budget_exhausted" };
  }
  return { ok: true };
}

function recordUsage(userId: string, outputTokens: number): void {
  const b = bucketFor(userId);
  b.minuteCount += 1;
  b.dayCount += 1;
  b.tokensToday += outputTokens;
}

async function gatherMessages(
  repos: Repositories,
  roomId: string,
  scope: Scope,
  messageIds: string[] | undefined
): Promise<ChatMessage[]> {
  const all = await repos.messages.listByRoom(roomId);
  const visible = all.filter((m) => !m.isDeleted && !m.isSystem);
  if (scope === "messageIds") {
    if (!messageIds || messageIds.length === 0) return [];
    const set = new Set(messageIds);
    return visible.filter((m) => set.has(m.id));
  }
  if (scope === "today") {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const cutoff = dayStart.getTime();
    return visible.filter((m) => Date.parse(m.createdAt) >= cutoff);
  }
  // recent20 + thread fallback
  return visible.slice(-20);
}

async function ensureMemberOrAdmin(
  repos: Repositories,
  req: Request,
  res: Response,
  roomId: string
): Promise<boolean> {
  const me = req.currentUser!;
  const room = await repos.rooms.findById(roomId, me.id);
  if (!room) {
    res.status(404).json({ error: "not_found" });
    return false;
  }
  if (me.role === "admin" || me.role === "super_admin") return true;
  if (!room.members.some((m) => m.userId === me.id)) {
    res.status(404).json({ error: "not_found" });
    return false;
  }
  return true;
}

function parseScope(body: unknown): { scope: Scope; messageIds?: string[] } | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (typeof b.roomId !== "string" || !b.roomId.trim()) return { error: "roomId_required" };
  const scope = (b.scope as Scope | undefined) ?? "recent20";
  if (!["recent20", "today", "thread", "messageIds"].includes(scope)) {
    return { error: "scope_invalid" };
  }
  if (scope === "messageIds") {
    if (!Array.isArray(b.messageIds) || !b.messageIds.every((x) => typeof x === "string")) {
      return { error: "messageIds_required" };
    }
    return { scope, messageIds: b.messageIds as string[] };
  }
  return { scope };
}

type Handler = (messages: ChatMessage[]) => Promise<{
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}>;

const COMMANDS: Record<string, { action: string; handler: Handler }> = {
  "chat-summary": { action: "ai.summarize", handler: summarize },
  "extract-tasks": { action: "ai.extract_tasks", handler: extractTasks },
  "extract-decisions": { action: "ai.extract_decisions", handler: extractDecisions },
  "draft-notice": { action: "ai.draft_notice", handler: draftNotice },
  minutes: { action: "ai.minutes", handler: minutes }
};

export function createAiRouter(repos: Repositories): Router {
  const router = Router();

  for (const [path, { action, handler }] of Object.entries(COMMANDS)) {
    router.post(`/${path}`, async (req, res) => {
      if (!isAiEnabled()) {
        res.status(503).json({ error: "ai_disabled" });
        return;
      }
      const me = req.currentUser!;
      const rate = checkRate(me.id);
      if (!rate.ok) {
        res.status(429).json({ error: rate.reason });
        return;
      }
      const parsed = parseScope(req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const roomId = (req.body as { roomId: string }).roomId;
      const ok = await ensureMemberOrAdmin(repos, req, res, roomId);
      if (!ok) return;
      const messages = await gatherMessages(repos, roomId, parsed.scope, parsed.messageIds);
      if (messages.length === 0) {
        res.status(400).json({ error: "no_messages_in_scope" });
        return;
      }
      try {
        const result = await handler(messages);
        recordUsage(me.id, result.usage.outputTokens);
        await auditLog(repos, req, {
          action,
          targetType: "room",
          targetId: roomId,
          targetLabel: `${messages.length} messages`,
          meta: {
            scope: parsed.scope,
            outputTokens: result.usage.outputTokens,
            inputTokens: result.usage.inputTokens
          }
        });
        res.json({
          text: result.text,
          usage: result.usage,
          sourceMessageIds: messages.map((m) => m.id)
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[hanmir-server] AI ${path} failed:`, err);
        res.status(502).json({ error: "ai_upstream_failed" });
      }
    });
  }

  return router;
}
