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
  anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6",
  aiDailyTokenLimit: Number(process.env.AI_DAILY_TOKEN_LIMIT ?? 0),

  // Phase 6 I-5 — Web Push (PWA). VAPID 키 없으면 push 자체 disabled.
  // 키 생성: npx tsx server/scripts/generate-vapid.ts
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() || undefined,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY?.trim() || undefined,
  vapidSubject:
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@hanmir-talk.local"
};
