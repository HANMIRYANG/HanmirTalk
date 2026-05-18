import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config";

// Phase 1 D-7 — outbound mail wrapper. Built once at module load; reused
// for every send. Phase 8 invitation flow will call sendMail({to, subject,
// html}); future system mails (password reset, weekly digest) go through
// the same entry point.
//
// Dev defaults connect to mailhog (docker-compose service "mailhog",
// SMTP on 1025, web UI on http://localhost:8025).
// Production overrides via SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/
// SMTP_SECURE/SMTP_FROM env vars (see .env.example).

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!config.smtpEnabled) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth:
      config.smtpUser && config.smtpPass
        ? { user: config.smtpUser, pass: config.smtpPass }
        : undefined
  });
  return transporter;
}

export interface MailMessage {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

// Returns { ok: true } on send, { ok: false, reason } when SMTP is
// disabled / fails. Never throws — caller decides how to surface the
// outcome (invitations might just queue and retry later).
export async function sendMail(
  msg: MailMessage
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, reason: "smtp_disabled" };
  try {
    const info = await t.sendMail({
      from: config.smtpFrom,
      to: Array.isArray(msg.to) ? msg.to.join(",") : msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html
    });
    return { ok: true, id: info.messageId };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] mailer send failed:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "send_failed" };
  }
}

// Optional sanity check at boot — verifies SMTP is reachable. Failure is
// just a log; doesn't block startup since outbound mail is best-effort.
export async function verifyMailer(): Promise<void> {
  const t = getTransporter();
  if (!t) {
    // eslint-disable-next-line no-console
    console.log("[hanmir-server] mailer: SMTP disabled (SMTP_ENABLED=false)");
    return;
  }
  try {
    await t.verify();
    // eslint-disable-next-line no-console
    console.log(
      `[hanmir-server] mailer: SMTP ready at ${config.smtpHost}:${config.smtpPort}`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[hanmir-server] mailer: SMTP unreachable at ${config.smtpHost}:${config.smtpPort} — outbound mail will fail. (${err instanceof Error ? err.message : err})`
    );
  }
}
