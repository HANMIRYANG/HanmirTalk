import { Router, type Request, type Response } from "express";
import type { Repositories } from "../repositories/types";
import { sessionStore } from "../auth/session";
import { requireAuth } from "../auth/middleware";
import {
  clearAuthCookies,
  extractRefreshToken,
  extractToken,
  setAuthCookies
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
// Future: a Next.js middleware refresh would let us drop this back down.
// Exported so /system/security-policy (Phase 8 K-3) reports the live values
// without re-declaring them.
export const ACCESS_MAX_AGE_SEC = 60 * 60;
export const REFRESH_MAX_AGE_SEC = 30 * 24 * 60 * 60;
export const PASSWORD_MIN_LENGTH = 8;

function clientContext(req: Request): { userAgent?: string; ip?: string } {
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
      if (resolved) await repos.refreshTokens.revoke(resolved.tokenId);
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  });

  // POST /auth/refresh — verify the refresh cookie, rotate it (revoke old +
  // issue new), and mint a fresh access token. Returns 401 on missing or
  // expired refresh so the client can redirect to /login.
  router.post("/refresh", async (req, res) => {
    const refreshRaw = extractRefreshToken(req);
    if (!refreshRaw) {
      res.status(401).json({ error: "missing_refresh" });
      return;
    }
    const resolved = await repos.refreshTokens.resolve(refreshRaw);
    if (!resolved) {
      // Clear stale cookies so the browser doesn't keep replaying them.
      clearAuthCookies(res);
      res.status(401).json({ error: "invalid_refresh" });
      return;
    }
    const user = await repos.users.findById(resolved.userId);
    if (!user || user.isActive === false) {
      await repos.refreshTokens.revoke(resolved.tokenId);
      clearAuthCookies(res);
      res.status(401).json({ error: "user_inactive" });
      return;
    }
    // Rotation: revoke the just-used refresh row so a replay (e.g. token
    // theft) cannot reuse it. Then issue a brand-new pair.
    await repos.refreshTokens.revoke(resolved.tokenId);
    await issueSessionFor(repos, res, user.id, clientContext(req));
    res.json({ ok: true, user });
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
