import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { ChatMessage, ProductDraft, ProjectDraft } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import {
  isAiEnabled,
  summarize,
  extractTasks,
  extractDecisions,
  draftNotice,
  minutes,
  draftProductFromDocs,
  draftProjectFromPrompt
} from "../ai/anthropic";
import { config } from "../config";
import { auditLog } from "../audit";
import { normalizeUploadOriginalName } from "../files/filename";

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

// ── AI 폼 초안 공통 헬퍼 ─────────────────────────────────────────────

// meetings/pipeline.ts parseMinutesJson 과 동일한 fenced JSON 추출.
function parseFencedJson<T>(text: string): T | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function asString(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function asStringArray(v: unknown, max = 30): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, max);
}

const DRAFT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asDate(v: unknown): string {
  const s = asString(v, 10);
  return DRAFT_DATE_RE.test(s) ? s : "";
}

// 모델 출력을 그대로 클라이언트에 흘리지 않고 알려진 필드만 정제한다.
function sanitizeProductDraft(raw: unknown): ProductDraft {
  const r = (raw ?? {}) as Record<string, unknown>;
  const specs = Array.isArray(r.specs)
    ? r.specs
        .map((s) => {
          const row = (s ?? {}) as Record<string, unknown>;
          return { key: asString(row.key, 100), value: asString(row.value, 500) };
        })
        .filter((s) => s.key && s.value)
        .slice(0, 40)
    : [];
  return {
    name: asString(r.name, 200),
    code: asString(r.code, 80),
    category: asString(r.category, 80),
    subCategory: asString(r.subCategory, 120),
    description: asString(r.description, 1000),
    features: asStringArray(r.features),
    applications: asStringArray(r.applications),
    cautions: asStringArray(r.cautions),
    specs
  };
}

function sanitizeProjectDraft(raw: unknown): ProjectDraft {
  const r = (raw ?? {}) as Record<string, unknown>;
  const milestones = Array.isArray(r.milestones)
    ? r.milestones
        .map((m) => {
          const row = (m ?? {}) as Record<string, unknown>;
          return {
            title: asString(row.title, 150),
            subtitle: asString(row.subtitle, 200),
            date: asDate(row.date)
          };
        })
        .filter((m) => m.title && m.date)
        .slice(0, 12)
    : [];
  return {
    name: asString(r.name, 200),
    fullName: asString(r.fullName, 200),
    code: asString(r.code, 50),
    department: asString(r.department, 100),
    description: asString(r.description, 2000),
    goals: asStringArray(r.goals),
    outputs: asStringArray(r.outputs),
    type: asString(r.type, 100),
    budget: asString(r.budget, 50),
    externalPartners: asString(r.externalPartners, 200),
    startDate: asDate(r.startDate),
    dueDate: asDate(r.dueDate),
    milestones
  };
}

// PDF 초안용 업로드 — MSDS/성적서 등 최대 3건, 각 10MB (Claude 요청 32MB
// 한도 내 base64 여유 확보). files.ts 와 달리 PDF 만 허용.
const draftUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    const name = normalizeUploadOriginalName(file.originalname).toLowerCase();
    const mime = (file.mimetype ?? "").toLowerCase();
    if (!name.endsWith(".pdf") || (mime !== "" && mime !== "application/pdf")) {
      cb(new Error("pdf_only"));
      return;
    }
    cb(null, true);
  }
});

function draftUploadErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (!err) return next();
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "pdf_only") {
    res.status(415).json({ error: "pdf_only" });
    return;
  }
  if (msg.toLowerCase().includes("file too large")) {
    res.status(413).json({ error: "file_too_large" });
    return;
  }
  if (msg.toLowerCase().includes("too many files")) {
    res.status(400).json({ error: "too_many_files" });
    return;
  }
  next(err);
}

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

  // ── 제품 등록 초안: MSDS/시험성적서 PDF 파싱 ─────────────────────
  // multipart 필드명 "files" (1~3건, PDF). 제품 등록 폼이 초안을 받아
  // 채우고, 사용자가 수정 후 일반 등록 경로(POST /products)로 제출한다
  // — 이 엔드포인트는 아무것도 저장하지 않는다.
  router.post(
    "/product-draft",
    draftUpload.array("files", 3),
    draftUploadErrorHandler,
    async (req: Request, res: Response) => {
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
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({ error: "files_required" });
        return;
      }
      try {
        const result = await draftProductFromDocs(
          files.map((f) => ({
            fileName: normalizeUploadOriginalName(f.originalname),
            base64: f.buffer.toString("base64")
          }))
        );
        const parsed = parseFencedJson<unknown>(result.text);
        if (!parsed) {
          res.status(502).json({ error: "ai_parse_failed" });
          return;
        }
        const draft = sanitizeProductDraft(parsed);
        recordUsage(me.id, result.usage.outputTokens);
        await auditLog(repos, req, {
          action: "ai.product_draft",
          targetType: "product",
          targetLabel: files.map((f) => normalizeUploadOriginalName(f.originalname)).join(", "),
          meta: {
            fileCount: files.length,
            outputTokens: result.usage.outputTokens,
            inputTokens: result.usage.inputTokens
          }
        });
        res.json({ draft, usage: result.usage });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[hanmir-server] AI product-draft failed:", err);
        res.status(502).json({ error: "ai_upstream_failed" });
      }
    }
  );

  // ── 프로젝트 등록 초안: 자연어 프롬프트 → 폼 + 마일스톤 ─────────
  router.post("/project-draft", async (req: Request, res: Response) => {
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
    const prompt =
      typeof (req.body as { prompt?: unknown })?.prompt === "string"
        ? ((req.body as { prompt: string }).prompt ?? "").trim()
        : "";
    if (prompt.length < 10) {
      res.status(400).json({ error: "prompt_too_short" });
      return;
    }
    if (prompt.length > 4000) {
      res.status(400).json({ error: "prompt_too_long" });
      return;
    }
    try {
      // KST 오늘 날짜 — 상대 일정("다음 달", "3분기") 환산 기준.
      const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const today = kst.toISOString().slice(0, 10);
      const result = await draftProjectFromPrompt(prompt, today);
      const parsed = parseFencedJson<unknown>(result.text);
      if (!parsed) {
        res.status(502).json({ error: "ai_parse_failed" });
        return;
      }
      const draft = sanitizeProjectDraft(parsed);
      recordUsage(me.id, result.usage.outputTokens);
      await auditLog(repos, req, {
        action: "ai.project_draft",
        targetType: "project",
        targetLabel: draft.name || prompt.slice(0, 60),
        meta: {
          outputTokens: result.usage.outputTokens,
          inputTokens: result.usage.inputTokens
        }
      });
      res.json({ draft, usage: result.usage });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[hanmir-server] AI project-draft failed:", err);
      res.status(502).json({ error: "ai_upstream_failed" });
    }
  });

  return router;
}
