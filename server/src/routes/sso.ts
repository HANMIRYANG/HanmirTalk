import express, { Router, type Request, type Response } from "express";
import { config } from "../config";
import type { Repositories } from "../repositories/types";
import { auditLog } from "../audit";
import {
  findSsoClient,
  isRegisteredRedirectUri,
  isValidCodeChallenge,
  isValidCodeVerifier,
  pkceChallengeMatches,
  sha256Hex,
  ssoEnabled,
  verifyClientSecret,
  type SsoClient
} from "../auth/sso";
import { clientContext, rotateRefreshSession, webUrl } from "./auth";

// HanmirERP SSO provider — one-time authorization-ticket flow (docs/
// HANMIR_ERP_SSO_CONTRACT.md). HanmirTalk is the company login entry point;
// the ERP never sees hanmir_token / hanmir_refresh and instead exchanges a
// short-lived single-use ticket for the user's identity, then mints its own
// host-scoped session cookie. Roles are deliberately NOT exported — Talk
// proves identity, the ERP owns its authorization model.
//
//   GET  /auth/sso/authorize  browser redirect in  → ticket redirect out
//   POST /auth/sso/exchange   ERP server-to-server → identity JSON
//
// Mounted under /auth so the refresh cookie (Path=/api/v1/auth) rides along
// with authorize requests — an expired access session with a live refresh
// recovers silently via the same rotation used by /auth/refresh and /bounce.

// state must be non-guessable enough for CSRF binding (ERP compares it) and
// printable ASCII per RFC 6749 appendix A.5.
const STATE_MIN_LENGTH = 8;
const STATE_MAX_LENGTH = 512;
const STATE_CHARSET = /^[\x20-\x7e]+$/;

// Fixed-window per-IP rate limiting — same in-app approach as the login
// brute-force counters in routes/auth.ts (single-process deployment; a
// multi-instance rollout must move these to Redis or similar). The IP key
// comes from clientContext → auth/client-ip.ts, i.e. the trust-proxy-aware
// req.ip — never a raw X-Forwarded-For parse a caller could forge.
const RATE_WINDOW_MS = 60 * 1000;
const AUTHORIZE_MAX_PER_IP = config.ssoAuthorizeRatePerMin;
const EXCHANGE_MAX_PER_IP = config.ssoExchangeRatePerMin;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function allowRate(key: string, max: number): boolean {
  const now = Date.now();
  if (rateBuckets.size > 10_000) {
    for (const [k, v] of rateBuckets) {
      if (v.resetAt <= now) rateBuckets.delete(k);
    }
  }
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

// Both endpoints deal in credentials-adjacent material — never cacheable.
function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function queryParam(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function bodyParam(req: Request, name: string): string | undefined {
  const value = (req.body ?? {})[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// Redirect back to the (already-validated) registered redirect_uri with an
// OAuth-style error. Only reachable AFTER client_id + redirect_uri passed
// exact-match validation — never with caller-supplied URIs.
function redirectError(
  res: Response,
  redirectUri: string,
  error: string,
  state?: string
): void {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state !== undefined) url.searchParams.set("state", state);
  res.redirect(302, url.toString());
}

export function createSsoRouter(repos: Repositories): Router {
  const router = Router();
  // The exchange endpoint follows OAuth token-endpoint convention and accepts
  // application/x-www-form-urlencoded in addition to JSON (which the global
  // express.json() already parses).
  router.use(express.urlencoded({ extended: false }));

  // ── GET /auth/sso/authorize ──────────────────────────────────────────────
  // Entry: browser lands here from the ERP (no ERP session). Requires a live
  // HanmirTalk session; expired-access-with-valid-refresh rotates silently,
  // and a fully logged-out browser detours through /login and returns.
  router.get("/authorize", async (req, res) => {
    noStore(res);
    if (!ssoEnabled()) {
      res.status(503).json({ error: "sso_not_configured" });
      return;
    }
    const ctx = clientContext(req);
    if (!allowRate(`authz:${ctx.ip ?? "unknown"}`, AUTHORIZE_MAX_PER_IP)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }

    // client_id + redirect_uri gate everything else. On failure we must NOT
    // redirect anywhere (open-redirect prevention) — plain 400 JSON.
    const clientId = queryParam(req, "client_id");
    const redirectUri = queryParam(req, "redirect_uri");
    const client = clientId ? findSsoClient(clientId) : undefined;
    if (!client) {
      await auditLog(repos, req, {
        action: "auth.sso.authorize.denied",
        level: "warn",
        meta: { clientId: clientId ?? null, reason: "unknown_client" }
      });
      res.status(400).json({ error: "invalid_client" });
      return;
    }
    if (!redirectUri || !isRegisteredRedirectUri(client, redirectUri)) {
      await auditLog(repos, req, {
        action: "auth.sso.authorize.denied",
        level: "warn",
        meta: {
          clientId: client.clientId,
          reason: "unregistered_redirect_uri",
          redirectUri: redirectUri ?? null
        }
      });
      res.status(400).json({ error: "invalid_redirect_uri" });
      return;
    }

    // From here on the redirect target is trusted (exact registered match),
    // so parameter errors report back to the ERP OAuth-style.
    const state = queryParam(req, "state");
    if (
      !state ||
      state.length < STATE_MIN_LENGTH ||
      state.length > STATE_MAX_LENGTH ||
      !STATE_CHARSET.test(state)
    ) {
      redirectError(res, redirectUri, "invalid_request");
      return;
    }
    const codeChallenge = queryParam(req, "code_challenge");
    const codeChallengeMethod = queryParam(req, "code_challenge_method");
    if (
      !codeChallenge ||
      !isValidCodeChallenge(codeChallenge) ||
      codeChallengeMethod !== "S256"
    ) {
      redirectError(res, redirectUri, "invalid_request", state);
      return;
    }

    // Session check. attachCurrentUser already resolved a live access token;
    // otherwise try the refresh cookie (same rotation as /auth/bounce).
    let user = req.currentUser;
    if (!user) {
      const rotated = await rotateRefreshSession(repos, req, res);
      if (rotated.ok) user = rotated.user;
    }
    if (!user) {
      // Not logged in — detour through the login page and come back. The
      // return target is OUR OWN relative authorize path rebuilt from the
      // validated parameters (never the raw query string), so login's `next`
      // can only ever point at this endpoint on this origin.
      const params = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
      });
      const selfPath = `${config.apiPrefix}/auth/sso/authorize?${params.toString()}`;
      res.redirect(302, webUrl(`/login?next=${encodeURIComponent(selfPath)}`));
      return;
    }
    // Re-validate account state at issuance — a deactivated user can still
    // hold a live in-memory access session for up to an hour.
    if (user.isActive === false) {
      await auditLog(
        repos,
        req,
        {
          action: "auth.sso.authorize.denied",
          level: "warn",
          targetType: "user",
          targetId: user.id,
          meta: { clientId: client.clientId, reason: "user_inactive" }
        },
        user
      );
      redirectError(res, redirectUri, "access_denied", state);
      return;
    }

    const { ticket } = await repos.ssoTickets.issue({
      userId: user.id,
      clientId: client.clientId,
      redirectUri,
      stateHash: sha256Hex(state),
      codeChallenge,
      ttlSec: config.ssoTicketTtlSec
    });
    // Audit records identity + client + outcome only — never the ticket.
    await auditLog(
      repos,
      req,
      {
        action: "auth.sso.authorize",
        targetType: "user",
        targetId: user.id,
        targetLabel: user.email,
        meta: { clientId: client.clientId }
      },
      user
    );
    const target = new URL(redirectUri);
    target.searchParams.set("code", ticket);
    target.searchParams.set("state", state);
    res.redirect(302, target.toString());
  });

  // ── POST /auth/sso/exchange ──────────────────────────────────────────────
  // Server-to-server. The ERP backend trades the one-time ticket (+ PKCE
  // verifier + client secret) for the user's identity, then issues its own
  // ERP-host session cookie. No HanmirTalk token of any kind is returned.
  router.post("/exchange", async (req, res) => {
    noStore(res);
    if (!ssoEnabled()) {
      res.status(503).json({ error: "sso_not_configured" });
      return;
    }
    const ctx = clientContext(req);
    if (!allowRate(`exch:${ctx.ip ?? "unknown"}`, EXCHANGE_MAX_PER_IP)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }

    const deny = async (
      status: number,
      error: string,
      client: SsoClient | undefined,
      reason: string,
      userId?: string
    ): Promise<void> => {
      await auditLog(repos, req, {
        action: "auth.sso.exchange.denied",
        level: "warn",
        ...(userId ? { targetType: "user", targetId: userId } : {}),
        meta: { clientId: client?.clientId ?? bodyParam(req, "client_id") ?? null, reason }
      });
      res.status(status).json({ error });
    };

    if (bodyParam(req, "grant_type") !== "authorization_code") {
      await deny(400, "unsupported_grant_type", undefined, "unsupported_grant_type");
      return;
    }
    // Client authentication comes FIRST — a caller without the secret must
    // never be able to consume (burn) someone's ticket.
    const clientId = bodyParam(req, "client_id");
    const clientSecret = bodyParam(req, "client_secret");
    const client = clientId ? findSsoClient(clientId) : undefined;
    if (!client || !clientSecret || !verifyClientSecret(client, clientSecret)) {
      await deny(401, "invalid_client", client, "client_auth_failed");
      return;
    }

    const code = bodyParam(req, "code") ?? bodyParam(req, "ticket");
    const redirectUri = bodyParam(req, "redirect_uri");
    const codeVerifier = bodyParam(req, "code_verifier");
    if (!code || !redirectUri || !codeVerifier || !isValidCodeVerifier(codeVerifier)) {
      await deny(400, "invalid_request", client, "missing_parameters");
      return;
    }

    // Atomic single-use consume — concurrent exchanges race on a conditional
    // UPDATE and at most one wins. Unknown, expired, and already-consumed all
    // collapse into the same invalid_grant (no oracle).
    const ticket = await repos.ssoTickets.consume(code);
    if (!ticket) {
      await deny(400, "invalid_grant", client, "ticket_invalid_or_used");
      return;
    }
    // Binding checks happen after consume, so a mismatched attempt burns the
    // ticket rather than leaving it alive for retries.
    if (ticket.clientId !== client.clientId || ticket.redirectUri !== redirectUri) {
      await deny(400, "invalid_grant", client, "binding_mismatch", ticket.userId);
      return;
    }
    if (!ticket.codeChallenge || !pkceChallengeMatches(codeVerifier, ticket.codeChallenge)) {
      await deny(400, "invalid_grant", client, "pkce_mismatch", ticket.userId);
      return;
    }
    // Re-validate the account at exchange time as well — deactivation between
    // authorize and exchange (or a stale ticket) must not mint an ERP session.
    const user = await repos.users.findById(ticket.userId);
    if (!user || user.isActive === false) {
      await deny(400, "invalid_grant", client, "user_inactive", ticket.userId);
      return;
    }

    await auditLog(
      repos,
      req,
      {
        action: "auth.sso.exchange",
        targetType: "user",
        targetId: user.id,
        targetLabel: user.email,
        meta: { clientId: client.clientId }
      },
      user
    );
    const issuedAt = new Date();
    // The response is an identity assertion, not a token: the ERP must create
    // its own session immediately. expiresAt bounds how long the assertion
    // may be trusted if session creation is deferred.
    res.json({
      ok: true,
      sub: user.id,
      email: user.email,
      name: user.name,
      departmentId: user.departmentId,
      departmentName: user.departmentName,
      // Guarded above — a row only reaches here when the account is active.
      isActive: true,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 60 * 1000).toISOString()
    });
  });

  return router;
}
