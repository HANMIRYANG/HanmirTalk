import type { Request, Response } from "express";
import { config } from "../config";

export const SESSION_COOKIE = "hanmir_token";
export const REFRESH_COOKIE = "hanmir_refresh";

// Refresh cookie is scoped to /auth/* so it isn't sent on every API call.
// Path includes apiPrefix because the cookie attribute Path is matched
// against the request URL, not the route mount.
const REFRESH_COOKIE_PATH = `${config.apiPrefix}/auth`;

// Set-Cookie attribute Secure should only be added when the deployment is
// actually HTTPS — browsers reject Secure cookies on plain http://localhost.
// CORS_ORIGIN starting with https:// is a reasonable proxy for that.
const SECURE = config.corsOrigin.includes("https://");

export function extractToken(req: Request): string | undefined {
  // Authorization header takes precedence so server-to-server / scripted
  // clients can still authenticate without juggling cookies.
  const header = req.header("authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return readCookie(req, SESSION_COOKIE);
}

export function extractRefreshToken(req: Request): string | undefined {
  return readCookie(req, REFRESH_COOKIE);
}

function readCookie(req: Request, name: string): string | undefined {
  const cookie = req.header("cookie");
  if (!cookie) return undefined;
  const match = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!match) return undefined;
  return decodeURIComponent(match.slice(name.length + 1));
}

// Set both auth cookies. Access cookie covers the whole app; refresh cookie
// is path-scoped so it never travels with normal API calls — only the
// /auth/* endpoints (login/logout/refresh) ever see it.
export function setAuthCookies(
  res: Response,
  opts: { accessToken: string; refreshToken: string; accessMaxAgeSec: number; refreshMaxAgeSec: number }
): void {
  res.append("Set-Cookie", buildCookie(SESSION_COOKIE, opts.accessToken, {
    path: "/",
    maxAgeSec: opts.accessMaxAgeSec
  }));
  res.append("Set-Cookie", buildCookie(REFRESH_COOKIE, opts.refreshToken, {
    path: REFRESH_COOKIE_PATH,
    maxAgeSec: opts.refreshMaxAgeSec
  }));
}

// Clear both auth cookies. Mirrors setAuthCookies' Path attributes so the
// browser actually drops them — a Set-Cookie with a different Path won't
// match the existing cookie and the clear silently fails.
export function clearAuthCookies(res: Response): void {
  res.append("Set-Cookie", buildCookie(SESSION_COOKIE, "", { path: "/", maxAgeSec: 0 }));
  res.append("Set-Cookie", buildCookie(REFRESH_COOKIE, "", {
    path: REFRESH_COOKIE_PATH,
    maxAgeSec: 0
  }));
}

function buildCookie(
  name: string,
  value: string,
  opts: { path: string; maxAgeSec: number }
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path}`,
    "HttpOnly",
    // Strict prevents the cookie from being attached to cross-site requests
    // entirely — fine here because the SPA and API share an origin (or are
    // CORS-configured peers, which is still same-site in browser terms when
    // explicitly listed).
    "SameSite=Strict",
    `Max-Age=${opts.maxAgeSec}`
  ];
  if (SECURE) parts.push("Secure");
  return parts.join("; ");
}
