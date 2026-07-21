import path from "path";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  apiPrefix: process.env.API_PREFIX ?? "/api/v1",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  defaultPassword: process.env.DEFAULT_PASSWORD ?? "hanmir1234",
  databaseUrl: process.env.DATABASE_URL?.trim() ? process.env.DATABASE_URL.trim() : undefined,
  // Where multer writes uploaded files. Path-resolve against process cwd so
  // the location is stable regardless of where node was launched from.
  // Override with UPLOAD_DIR for prod (e.g. a docker volume mount).
  uploadDir: path.resolve(
    process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), "server", "uploads")
  ),
  // Max upload size in bytes. spec docs/12 caps MVP at 50 MB; override via
  // UPLOAD_MAX_BYTES env (admins can tune in future settings UI).
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 50 * 1024 * 1024),

  // SMTP for outbound mail (Phase 1 D-7). Used by Phase 8 invitation flow
  // and any future system mail. Defaults wired to docker-compose mailhog
  // so dev works without config; production sets real values via env.
  smtpHost: process.env.SMTP_HOST?.trim() || "localhost",
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
  smtpUser: process.env.SMTP_USER?.trim() || undefined,
  smtpPass: process.env.SMTP_PASS?.trim() || undefined,
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpFrom: process.env.SMTP_FROM?.trim() || "한미르톡 <no-reply@hanmir-talk.local>",
  smtpEnabled: process.env.SMTP_ENABLED !== "false",

  // Phase 5 H-4 — Anthropic Claude integration for the /ai/* command
  // suite. ANTHROPIC_API_KEY missing ⇒ the routes return 503 "ai_disabled"
  // so the UI can show "관리자에게 키 설정을 요청하세요" hint without
  // crashing. ANTHROPIC_MODEL is the model id; pick the cheapest one
  // that handles Korean reliably. AI_DAILY_TOKEN_LIMIT caps the per-user
  // daily output token spend; defaults to 0 = no cap (dev convenience).
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
  anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5",
  aiDailyTokenLimit: Number(process.env.AI_DAILY_TOKEN_LIMIT ?? 0),

  // Phase 6 I-5 — Web Push (PWA). VAPID 키 없으면 push 자체 disabled.
  // 키 생성: npx tsx server/scripts/generate-vapid.ts
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() || undefined,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY?.trim() || undefined,
  vapidSubject:
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@hanmir-talk.local",

  // 회의 녹음 → AI 회의록 파이프라인. GEMINI_API_KEY 가 없으면(그리고
  // MEETING_AI_MOCK 도 아니면) 회의 시작 API 가 503 meeting_ai_disabled 를
  // 반환해 기능이 자연 비활성화된다 — 전사할 수 없는 죽은 녹음을 만들지
  // 않기 위해. MEETING_AI_MOCK=true 는 Gemini/Claude 호출을 목으로 대체해
  // API 키 없이 파이프라인 E2E 테스트를 가능하게 한다.
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
  geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash",
  meetingMaxHours: Number(process.env.MEETING_MAX_HOURS ?? 4),
  audioRetentionDays: Number(process.env.AUDIO_RETENTION_DAYS ?? 30),
  meetingAiMock: process.env.MEETING_AI_MOCK === "true",
  // 청크 1개 상한. 5분 opus ≈ 2~5MB 라 15MB 면 여유. Caddy 60MB 한도 아래.
  meetingChunkMaxBytes: Number(process.env.MEETING_CHUNK_MAX_BYTES ?? 15 * 1024 * 1024),
  // 세그먼트 길이 상한(분). Gemini 전사 출력 토큰 한계(65K)의 방어선 —
  // 55분에 rotateSuggested, 상한+5분에서 409 segment_too_long.
  meetingSegmentMaxMinutes: Number(process.env.MEETING_SEGMENT_MAX_MINUTES ?? 60),
  // awaiting_ppt(부서별 PPT 업로드 대기) 상한(시간). 초과 시 워커가 PPT
  // 없이 회의록 생성을 자동 진행한다.
  meetingPptWaitHours: Number(process.env.MEETING_PPT_WAIT_HOURS ?? 24),

  // HanmirERP SSO — one-time authorization ticket TTL (seconds). The ticket
  // only has to survive one browser redirect + one server-to-server exchange,
  // so 60 s is generous. Clamped to [10, 300] so a bad env value can't turn
  // tickets into long-lived bearer credentials. Client registry itself is
  // SSO_CLIENTS (parsed in auth/sso.ts).
  ssoTicketTtlSec: Math.min(
    300,
    Math.max(10, Number(process.env.SSO_TICKET_TTL_SEC ?? 60) || 60)
  )
};
