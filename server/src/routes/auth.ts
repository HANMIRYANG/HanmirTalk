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

// Phase 1 D-3 — httpOnly cookie auth with refresh rotation.
// Access cookie: 15 min, in-memory sessionStore (lost on server restart;
// refresh recovers).
// Refresh cookie: 30 days, refresh_tokens table, rotated on every use.
const ACCESS_MAX_AGE_SEC = 15 * 60;
const REFRESH_MAX_AGE_SEC = 30 * 24 * 60 * 60;

function clientContext(req: Request): { userAgent?: string; ip?: string } {
  return {
    userAgent: req.header("user-agent") ?? undefined,
    ip:
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      undefined
  };
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
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }
    const { accessToken } = await issueSessionFor(repos, res, user.id, clientContext(req));
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
    if (newPassword.length < 8) {
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
    res.json({ ok: true });
  });

  return router;
}
