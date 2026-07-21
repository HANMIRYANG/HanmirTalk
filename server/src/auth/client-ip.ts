import type { Request } from "express";

// Single source of truth for "who is this request from" — used by the login
// brute-force counters, the SSO authorize/exchange rate limiters, and the
// audit log so all three always agree on the same address.
//
// `req.ip` is Express' proxy-aware resolution driven by the `trust proxy`
// setting (config.trustProxyHops, applied in app.ts):
//   * TRUST_PROXY_HOPS=0 (default, dev/direct): X-Forwarded-For is ignored
//     entirely — a client talking straight to Express cannot spoof its
//     address by sending forged headers; the socket peer always wins.
//   * TRUST_PROXY_HOPS=1 (production): exactly one hop (Caddy) is trusted.
//     Caddy overwrites X-Forwarded-For with the single client IP it derived
//     from Cloudflare's CF-Connecting-IP inside the trusted boundary
//     (Caddyfile: trusted_proxies + client_ip_headers + header_up), so the
//     header Express parses is never attacker-controlled.
//
// NEVER read req.headers["x-forwarded-for"] directly anywhere else — that
// bypasses the trust evaluation and reintroduces the spoofing hole.
export function clientIp(req: Request): string | undefined {
  return req.ip ?? req.socket?.remoteAddress ?? undefined;
}
