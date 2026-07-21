import { createHash } from "crypto";
import { Router, type Request, type Response } from "express";
import type { User } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { config } from "../config";
import { sessionStore } from "../auth/session";
import { requireAuth } from "../auth/middleware";
import {
  clearAuthCookies,
  extractRefreshToken,
  extractToken,
  setAuthCookies,
  setBounceGuardCookie
} from "../auth/token";
import { auditLog } from "../audit";

// Phase 1 D-3 — httpOnly cookie auth with refresh rotation.
// Access cookie: 1 hour. The original 15-min value was tightened from a
// pure-security standpoint, but every page.tsx runs a server-side
// /auth/me check on render and SSR has no way to call /auth/refresh
// (cookie writes need a response context the layout doesn't own). With
// 15-min access, any idle ≥15 min produced a forced re-login despite a
// valid 30-day refresh. 1 hour covers normal business-hour navigation
// while keeping refresh rotation as the primary security boundary.
// GET /auth/bounce (below) now gives SSR a recovery path — the layout
// redirects through it on 401 — so idle past 1 hour silently re-issues
// instead of forcing re-login.
// Exported so /system/security-policy (Phase 8 K-3) reports the live values
// without re-declaring them.
export const ACCESS_MAX_AGE_SEC = 60 * 60;
export const REFRESH_MAX_AGE_SEC = 30 * 24 * 60 * 60;
export const PASSWORD_MIN_LENGTH = 8;

// Exported for routes/sso.ts — the SSO authorize endpoint issues sessions
// through the same refresh-rotation path and needs the same client context.
export function clientContext(req: Request): { userAgent?: string; ip?: string } {
  return {
    userAgent: req.header("user-agent") ?? undefined,
    ip:
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      undefined
  };
}

// 로그인 brute-force 방어 — in-app fixed-window 카운터 (단일 프로세스
// 운영 전제, ai.ts 의 rate limiter 와 같은 접근. Redis 도입 시 교체).
// 시도 자체를 세므로 비밀번호 검증 전에 호출한다. 성공 로그인은 해당
// IP×계정 카운터를 초기화해, 몇 번 오타 후 성공한 사용자가 윈도우가
// 끝날 때까지 잠기지 않도록 한다.
const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_MAX_PER_ACCOUNT = 5; // IP×계정 기준
const LOGIN_MAX_PER_IP = 30; // IP 전체 기준 (사무실 공용 NAT 고려)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function bumpLoginCounter(key: string, max: number, now: number): boolean {
  const bucket = loginAttempts.get(key);
  if (!bucket || bucket.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

function loginAccountKey(ip: string | undefined, lookup: string): string {
  return `acct:${ip ?? "unknown"}|${lookup.toLowerCase()}`;
}

function checkLoginRate(ip: string | undefined, lookup: string): boolean {
  const now = Date.now();
  // 만료 버킷 정리 — 맵이 커졌을 때만 (평상시 비용 0).
  if (loginAttempts.size > 10_000) {
    for (const [k, v] of loginAttempts) {
      if (v.resetAt <= now) loginAttempts.delete(k);
    }
  }
  const ipOk = bumpLoginCounter(`ip:${ip ?? "unknown"}`, LOGIN_MAX_PER_IP, now);
  const acctOk = bumpLoginCounter(loginAccountKey(ip, lookup), LOGIN_MAX_PER_ACCOUNT, now);
  return ipOk && acctOk;
}

async function issueSessionFor(
  repos: Repositories,
  res: Response,
  userId: string,
  ctx: { userAgent?: string; ip?: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const access = sessionStore.issue(userId);
  const refresh = await repos.refreshTokens.issue(userId, ctx);
  setAuthCookies(res, {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessMaxAgeSec: ACCESS_MAX_AGE_SEC,
    refreshMaxAgeSec: REFRESH_MAX_AGE_SEC
  });
  return { accessToken: access.token, refreshToken: refresh.token };
}

// 리프레시 회전 유예 — 다중 탭이 같은 리프레시 토큰으로 동시에 /refresh 를
// 치면 첫 탭의 회전이 나머지 탭의 토큰을 무효화해 강제 로그아웃됐다.
// 회전 직후 60초 동안 "방금 폐기된 토큰 해시 → 새로 발급된 리프레시"를
// 인메모리로 기억해 두고, 늦게 도착한 탭에는 같은 새 토큰을 다시 내려준다.
// (단일 프로세스 운영 전제 — loginAttempts 와 같은 접근.)
const ROTATION_GRACE_MS = 60_000;
const rotationGrace = new Map<
  string,
  { refreshToken: string; userId: string; until: number }
>();

function rotationGraceKey(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function recordRotationGrace(oldRawToken: string, refreshToken: string, userId: string): void {
  const now = Date.now();
  for (const [key, entry] of rotationGrace) {
    if (entry.until <= now) rotationGrace.delete(key);
  }
  rotationGrace.set(rotationGraceKey(oldRawToken), {
    refreshToken,
    userId,
    until: now + ROTATION_GRACE_MS
  });
}

function findRotationGrace(
  rawToken: string
): { refreshToken: string; userId: string } | undefined {
  const entry = rotationGrace.get(rotationGraceKey(rawToken));
  if (!entry || entry.until <= Date.now()) return undefined;
  return entry;
}

// 유예 맵에는 살아 있는 리프레시 평문이 담기므로, "세션 전부 무효화"가
// 목적인 로그아웃·비밀번호 변경 시에는 해당 사용자 항목도 함께 비운다.
function clearRotationGraceForUser(userId: string): void {
  for (const [key, entry] of rotationGrace) {
    if (entry.userId === userId) rotationGrace.delete(key);
  }
}

export type RefreshFailure = "missing_refresh" | "invalid_refresh" | "user_inactive";

// POST /refresh 와 GET /bounce 가 공유하는 회전 본체. 성공 시 새 쿠키를
// res 에 심고 user 를 돌려준다. 실패 시 쿠키 정리는 호출부 책임
// (refresh 는 401 JSON, bounce 는 302 /login 으로 각자 마무리).
// GET /auth/sso/authorize (routes/sso.ts) 도 같은 경로를 쓴다 — 리프레시
// 쿠키가 Path=/api/v1/auth 스코프라 /auth/sso/* 요청에도 실리므로, access
// 만료 상태로 authorize 에 진입한 브라우저를 재로그인 없이 복구한다.
export async function rotateRefreshSession(
  repos: Repositories,
  req: Request,
  res: Response
): Promise<{ ok: true; user: User } | { ok: false; error: RefreshFailure }> {
  const refreshRaw = extractRefreshToken(req);
  if (!refreshRaw) return { ok: false, error: "missing_refresh" };
  const resolved = await repos.refreshTokens.resolve(refreshRaw);
  if (!resolved) {
    // 회전 유예: 방금 다른 탭이 회전시킨 토큰이면 같은 새 토큰을 재발급.
    const grace = findRotationGrace(refreshRaw);
    if (!grace) return { ok: false, error: "invalid_refresh" };
    const user = await repos.users.findById(grace.userId);
    if (!user || user.isActive === false) return { ok: false, error: "user_inactive" };
    const access = sessionStore.issue(user.id);
    setAuthCookies(res, {
      accessToken: access.token,
      refreshToken: grace.refreshToken,
      accessMaxAgeSec: ACCESS_MAX_AGE_SEC,
      refreshMaxAgeSec: REFRESH_MAX_AGE_SEC
    });
    return { ok: true, user };
  }
  const user = await repos.users.findById(resolved.userId);
  if (!user || user.isActive === false) {
    await repos.refreshTokens.revoke(resolved.tokenId);
    return { ok: false, error: "user_inactive" };
  }
  // Rotation: revoke the just-used refresh row so a replay (e.g. token
  // theft) cannot reuse it. Then issue a brand-new pair.
  await repos.refreshTokens.revoke(resolved.tokenId);
  const { refreshToken } = await issueSessionFor(repos, res, user.id, clientContext(req));
  recordRotationGrace(refreshRaw, refreshToken, user.id);
  return { ok: true, user };
}

// bounce 의 리다이렉트 목적지는 웹 오리진 기준. 운영(caddy 동일 오리진)
// 에서는 상대경로로 충분하지만, dev 처럼 API(4000)와 웹(3000)이 다른
// 오리진이면 상대경로가 API 오리진으로 풀리므로 CORS_ORIGIN 을 붙인다.
// (routes/sso.ts 의 /login 리다이렉트도 같은 규칙을 쓴다.)
export function webUrl(path: string): string {
  const origin = config.corsOrigin.split(",")[0]?.trim();
  if (!origin || !origin.startsWith("http")) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

export function createAuthRouter(repos: Repositories): Router {
  const router = Router();

  router.post("/login", async (req, res) => {
    const { id, email, password } = req.body ?? {};
    const lookup = (typeof email === "string" && email) || (typeof id === "string" && id) || "";
    if (!lookup || typeof password !== "string") {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const ctx = clientContext(req);
    if (!checkLoginRate(ctx.ip, lookup)) {
      res.status(429).json({ error: "too_many_attempts" });
      return;
    }
    const user = lookup.includes("@")
      ? await repos.users.findByEmail(lookup)
      : await repos.users.findById(lookup);
    if (!user) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    if (user.isActive === false) {
      res.status(401).json({ error: "account_inactive" });
      return;
    }
    const valid = await repos.users.verifyPassword(user.id, password);
    if (!valid) {
      // Audit only privileged-account failures — regular users hitting the
      // wrong password is high-volume noise. For admins it's a meaningful
      // signal worth surfacing in the audit log.
      if (user.role === "admin" || user.role === "super_admin") {
        // req.currentUser is still empty here — pass the targeted account as
        // the explicit actor so the failure is attributed to it.
        await auditLog(
          repos,
          req,
          {
            action: "auth.login.failure",
            targetType: "user",
            targetId: user.id,
            targetLabel: user.email,
            level: "warn"
          },
          user
        );
      }
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    // 성공 — 해당 IP×계정의 실패 카운터 초기화.
    loginAttempts.delete(loginAccountKey(ctx.ip, lookup));
    const { accessToken } = await issueSessionFor(repos, res, user.id, ctx);
    if (user.role === "admin" || user.role === "super_admin") {
      await auditLog(
        repos,
        req,
        {
          action: "auth.login.success",
          targetType: "user",
          targetId: user.id,
          targetLabel: user.email
        },
        user
      );
    }
    // Keep `token` in the response body for the transition period — older
    // frontend code paths still read it, and Authorization-header API
    // consumers (scripts, tests) rely on it. New frontend code should
    // ignore it and rely on the httpOnly cookie.
    res.json({ ok: true, token: accessToken, user });
  });

  router.post("/logout", async (req, res) => {
    const accessToken = extractToken(req);
    if (accessToken) sessionStore.revoke(accessToken);
    const refreshRaw = extractRefreshToken(req);
    if (refreshRaw) {
      const resolved = await repos.refreshTokens.resolve(refreshRaw);
      if (resolved) {
        await repos.refreshTokens.revoke(resolved.tokenId);
        clearRotationGraceForUser(resolved.userId);
      } else {
        const grace = findRotationGrace(refreshRaw);
        if (grace) clearRotationGraceForUser(grace.userId);
      }
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  });

  // POST /auth/refresh — verify the refresh cookie, rotate it (revoke old +
  // issue new), and mint a fresh access token. Returns 401 on missing or
  // expired refresh so the client can redirect to /login.
  router.post("/refresh", async (req, res) => {
    const result = await rotateRefreshSession(repos, req, res);
    if (!result.ok) {
      // Clear stale cookies so the browser doesn't keep replaying them.
      // (missing_refresh 는 지울 것도 없음 — 기존 동작 유지.)
      if (result.error !== "missing_refresh") clearAuthCookies(res);
      res.status(401).json({ error: result.error });
      return;
    }
    res.json({ ok: true, user: result.user });
  });

  // GET /auth/bounce?next=<path> — SSR 세션 복구용. 페이지 요청에는
  // 리프레시 쿠키(Path=/api/v1/auth 스코프)가 실리지 않아 Next 레이아웃이
  // 직접 갱신할 수 없으므로, 만료 감지 시 브라우저를 이 엔드포인트로
  // 302 시켜 쿠키 Path 안에서 회전시킨 뒤 원래 경로로 되돌려 보낸다.
  router.get("/bounce", async (req, res) => {
    const rawNext = typeof req.query.next === "string" ? req.query.next : "";
    const next =
      rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
        ? rawNext
        : "/";
    setBounceGuardCookie(res);
    const result = await rotateRefreshSession(repos, req, res);
    if (!result.ok) {
      // missing_refresh 는 지우지 않는다 — 기존 SameSite=Strict 쿠키를 가진
      // 브라우저가 외부 링크(크로스 사이트 내비게이션)로 진입하면 쿠키가
      // 하나도 실리지 않은 채 여기 도달하는데, 그때 Max-Age=0 을 내리면
      // 멀쩡한 세션 쿠키까지 파기된다. 진짜 무효 토큰만 정리.
      if (result.error !== "missing_refresh") clearAuthCookies(res);
      res.redirect(302, webUrl("/login"));
      return;
    }
    res.redirect(302, webUrl(next));
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json(req.currentUser);
  });

  // Phase 1 D-2: change own password. Requires the current password to
  // confirm and clears must_change_password on success.
  router.post("/change-password", requireAuth, async (req, res) => {
    const me = req.currentUser!;
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      res.status(400).json({ error: "password_too_short" });
      return;
    }
    if (currentPassword === newPassword) {
      res.status(400).json({ error: "password_unchanged" });
      return;
    }
    const valid = await repos.users.verifyPassword(me.id, currentPassword);
    if (!valid) {
      res.status(401).json({ error: "invalid_current_password" });
      return;
    }
    await repos.users.setPassword(me.id, newPassword);
    // Defense: invalidate every other session for this user so an attacker
    // who already stole a refresh token loses access immediately.
    await repos.refreshTokens.revokeAllForUser(me.id);
    clearRotationGraceForUser(me.id);
    await auditLog(repos, req, {
      action: "auth.password.change",
      targetType: "user",
      targetId: me.id,
      targetLabel: me.email
    });
    res.json({ ok: true });
  });

  // Phase 8 K-2 — 초대 미리보기 (비인증). accept 페이지가 폼 렌더용으로
  // 호출. 유효하지 않으면 valid:false만 반환해 토큰 정보를 흘리지 않는다.
  router.get("/invitation/:token", async (req, res) => {
    const invitation = await repos.invitations.findByToken(req.params.token);
    if (!invitation || invitation.status !== "pending") {
      res.json({ valid: false });
      return;
    }
    res.json({
      valid: true,
      email: invitation.email,
      role: invitation.role,
      departmentName: invitation.departmentName
    });
  });

  // Phase 8 K-2 — 초대 수락 (비인증). 토큰 + 이름 + 비밀번호로 계정 생성.
  router.post("/accept-invite", async (req, res) => {
    const { token, name, password } = req.body ?? {};
    if (
      typeof token !== "string" ||
      typeof name !== "string" ||
      typeof password !== "string"
    ) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    if (!name.trim()) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      res.status(400).json({ error: "password_too_short" });
      return;
    }
    const invitation = await repos.invitations.findByToken(token);
    if (!invitation) {
      res.status(404).json({ error: "invitation_not_found" });
      return;
    }
    if (invitation.status === "accepted") {
      res.status(409).json({ error: "invitation_used" });
      return;
    }
    if (invitation.status === "expired") {
      res.status(410).json({ error: "invitation_expired" });
      return;
    }
    if (!invitation.departmentId) {
      // Department was deleted while the invite was pending.
      res.status(409).json({ error: "department_unavailable" });
      return;
    }
    // Someone may have registered this email by other means since the
    // invite was issued.
    const existing = await repos.users.findByEmail(invitation.email);
    if (existing) {
      res.status(409).json({ error: "email_already_registered" });
      return;
    }
    // Atomic claim — concurrent accepts cannot both create a user.
    const claimed = await repos.invitations.markAccepted(invitation.id);
    if (!claimed) {
      res.status(409).json({ error: "invitation_used" });
      return;
    }
    const user = await repos.users.create({
      name: name.trim(),
      email: invitation.email,
      departmentId: invitation.departmentId,
      position: "",
      role: invitation.role
    });
    await repos.users.setPassword(user.id, password);
    await auditLog(
      repos,
      req,
      {
        action: "invitation.accept",
        targetType: "user",
        targetId: user.id,
        targetLabel: user.email
      },
      user
    );
    res.status(201).json({ ok: true });
  });

  return router;
}
