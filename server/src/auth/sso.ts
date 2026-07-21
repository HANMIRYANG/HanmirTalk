import { createHash, timingSafeEqual } from "crypto";

// HanmirERP SSO — client registry + PKCE helpers.
//
// Registered relying parties (today: HanmirERP) come from the SSO_CLIENTS
// env var — a JSON array kept only in the gitignored env file / vault:
//
//   SSO_CLIENTS='[{"clientId":"hanmir-erp","name":"HanmirERP",
//     "secretSha256":"<64-hex sha256 of the client secret>",
//     "redirectUris":["https://erp.example.com/auth/sso/callback"]}]'
//
// Design decisions:
//   * HanmirTalk never holds the raw client secret — only its sha256 digest.
//     The raw secret lives solely in the ERP server's own env/vault, so even
//     this env file leaking does not yield a usable credential.
//   * redirectUris are matched by EXACT string equality. No substring, no
//     prefix, no wildcard — the only redirect targets are the literal
//     pre-registered values, which kills open-redirect abuse at the root.
//   * previousSecretSha256 enables zero-downtime secret rotation: during the
//     rotation window both digests verify; remove the field afterwards.

export interface SsoClient {
  clientId: string;
  name: string;
  secretSha256: string;
  previousSecretSha256?: string;
  redirectUris: string[];
}

const HEX64 = /^[0-9a-f]{64}$/;

function parseClients(rawJson: string | undefined): SsoClient[] {
  if (!rawJson || !rawJson.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    // Never echo the raw value — it names redirect hosts and secret digests.
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] SSO_CLIENTS is not valid JSON — SSO disabled");
    return [];
  }
  if (!Array.isArray(parsed)) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] SSO_CLIENTS must be a JSON array — SSO disabled");
    return [];
  }
  const clients: SsoClient[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const clientId = typeof e.clientId === "string" ? e.clientId.trim() : "";
    const secretSha256 =
      typeof e.secretSha256 === "string" ? e.secretSha256.trim().toLowerCase() : "";
    const previous =
      typeof e.previousSecretSha256 === "string"
        ? e.previousSecretSha256.trim().toLowerCase()
        : undefined;
    const redirectUris = Array.isArray(e.redirectUris)
      ? e.redirectUris.filter((u): u is string => {
          if (typeof u !== "string" || !u) return false;
          // Absolute http(s) URLs only — the authorize handler builds
          // `new URL(redirectUri)` on the success path, so a malformed
          // registration must fail here at boot, not as a runtime 500.
          try {
            const parsed = new URL(u);
            return parsed.protocol === "https:" || parsed.protocol === "http:";
          } catch {
            return false;
          }
        })
      : [];
    // clientId is url-safe and short; malformed entries are dropped loudly so
    // a typo can't silently register a permissive client.
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(clientId) || !HEX64.test(secretSha256) ||
        (previous !== undefined && !HEX64.test(previous)) || redirectUris.length === 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[hanmir-server] SSO_CLIENTS entry ${clientId ? `"${clientId}" ` : ""}is malformed — entry skipped`
      );
      continue;
    }
    clients.push({
      clientId,
      name: typeof e.name === "string" && e.name.trim() ? e.name.trim() : clientId,
      secretSha256,
      previousSecretSha256: previous,
      redirectUris
    });
  }
  return clients;
}

// Parsed once at boot (load-env.ts runs before any import reads process.env).
const clients = parseClients(process.env.SSO_CLIENTS);

export function findSsoClient(clientId: string): SsoClient | undefined {
  return clients.find((c) => c.clientId === clientId);
}

export function ssoEnabled(): boolean {
  return clients.length > 0;
}

// Exact-match only. Callers must treat `false` as a hard stop and must NOT
// redirect to the offending URI (open-redirect prevention).
export function isRegisteredRedirectUri(client: SsoClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Constant-time digest comparison. Both sides are reduced to sha256 buffers
// first so length differences never short-circuit.
function digestMatches(rawSecret: string, expectedHex: string): boolean {
  const actual = createHash("sha256").update(rawSecret).digest();
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export function verifyClientSecret(client: SsoClient, rawSecret: string): boolean {
  if (digestMatches(rawSecret, client.secretSha256)) return true;
  // Rotation window — accept the previous secret while the ERP side rolls.
  if (client.previousSecretSha256) return digestMatches(rawSecret, client.previousSecretSha256);
  return false;
}

// RFC 7636 §4.1 — code_verifier: unreserved charset [A-Za-z0-9-._~],
// 43..128 chars.
const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
// S256 code_challenge is BASE64URL(SHA256(verifier)): 32 bytes → exactly 43
// base64url chars [A-Za-z0-9_-], no "=" padding — and never "." or "~",
// which are verifier-only characters. Stricter than the verifier rule on
// purpose: anything else cannot be the output of the S256 derivation.
const PKCE_S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isValidCodeChallenge(challenge: string): boolean {
  return PKCE_S256_CHALLENGE.test(challenge);
}

export function isValidCodeVerifier(verifier: string): boolean {
  return PKCE_VERIFIER.test(verifier);
}

// S256: challenge = BASE64URL(SHA256(ascii(verifier))). Constant-time compare.
export function pkceChallengeMatches(codeVerifier: string, storedChallenge: string): boolean {
  const derived = createHash("sha256").update(codeVerifier).digest("base64url");
  const a = Buffer.from(derived);
  const b = Buffer.from(storedChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
