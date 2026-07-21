// One-shot helper: provision a HanmirERP SSO client credential.
// Usage from repo root:
//   npx tsx server/scripts/generate-sso-client.ts <clientId> <redirectUri> [redirectUri2 ...]
// Example:
//   npx tsx server/scripts/generate-sso-client.ts hanmir-erp https://erp.example.com/auth/sso/callback
//
// Prints (to the operator's terminal ONLY — run locally, never in CI logs):
//   * the raw client secret  → goes into the ERP server's env/vault
//   * its sha256 hex digest  → goes into HanmirTalk's SSO_CLIENTS entry
//   * a ready-to-paste SSO_CLIENTS JSON snippet
//
// HanmirTalk itself never stores the raw secret; only the digest verifies at
// POST /auth/sso/exchange. Rotation: run again, put the OLD digest into
// previousSecretSha256, deploy, switch the ERP to the new secret, then drop
// previousSecretSha256 (docs/HANMIR_ERP_SSO_CONTRACT.md §8).

import { createHash, randomBytes } from "crypto";

const [clientId, ...redirectUris] = process.argv.slice(2);

if (!clientId || redirectUris.length === 0) {
  // eslint-disable-next-line no-console
  console.error(
    "Usage: npx tsx server/scripts/generate-sso-client.ts <clientId> <redirectUri> [more...]"
  );
  process.exit(1);
}

if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(clientId)) {
  // eslint-disable-next-line no-console
  console.error("clientId must be 2-64 chars of [a-z0-9._-] starting alphanumeric");
  process.exit(1);
}

for (const uri of redirectUris) {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    // eslint-disable-next-line no-console
    console.error(`redirectUri is not an absolute URL: ${uri}`);
    process.exit(1);
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    // eslint-disable-next-line no-console
    console.error(`redirectUri must be https (localhost excepted): ${uri}`);
    process.exit(1);
  }
}

const secret = randomBytes(32).toString("base64url");
const secretSha256 = createHash("sha256").update(secret).digest("hex");
const entry = {
  clientId,
  name: clientId,
  secretSha256,
  redirectUris
};

// eslint-disable-next-line no-console
console.log(`# 1) ERP 서버 환경(vault)에만 저장 — HanmirTalk 쪽에는 절대 넣지 않는다:
ERP_SSO_CLIENT_SECRET=${secret}

# 2) HanmirTalk .env(.prod) 의 SSO_CLIENTS 에 추가 (해시만 저장됨):
SSO_CLIENTS=${JSON.stringify([entry])}

# 이미 다른 클라이언트가 등록돼 있으면 배열에 이 항목만 이어 붙일 것:
${JSON.stringify(entry)}`);
