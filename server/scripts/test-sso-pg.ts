// HanmirERP SSO — PostgreSQL-level verification for the parts whose
// semantics differ from the memory adapter:
//   * migration 036 applies on top of the full 001~035 chain
//   * consume() single-use atomicity via the conditional UPDATE
//     (two truly parallel connections — exactly one may win)
//   * expiry enforced inside SQL (expires_at > NOW())
//   * only sha256 digests reach the table
//
// SAFETY: refuses to run without TEST_PG_URL — never implicitly touches a
// real DATABASE_URL. Intended target is a throwaway container, e.g.:
//   docker network create sso-test-net
//   docker run -d --name sso-test-pg --network sso-test-net \
//     -e POSTGRES_USER=hanmir -e POSTGRES_PASSWORD=test -e POSTGRES_DB=hanmir_talk \
//     -v /srv/hanmir-talk/server/src/db/migrations:/docker-entrypoint-initdb.d:ro \
//     postgres:16-alpine
//   docker run --rm --network sso-test-net -u $(id -u):$(id -g) \
//     -v /srv/hanmir-talk:/app -w /app -e HOME=/tmp \
//     -e TEST_PG_URL=postgres://hanmir:test@sso-test-pg:5432/hanmir_talk \
//     node:20-alpine npx tsx server/scripts/test-sso-pg.ts
//   docker rm -f sso-test-pg && docker network rm sso-test-net

import { createHash } from "crypto";
import { Pool } from "pg";

const url = process.env.TEST_PG_URL;
if (!url) {
  console.error("TEST_PG_URL 미설정 — 일회용 테스트 DB URL 을 지정하세요 (운영 DB 금지).");
  process.exit(1);
}

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: url, max: 4 });
  const { createPostgresRepositories } = await import("../src/repositories/postgres");
  const repos = createPostgresRepositories(pool);

  // 마이그레이션 체인(001~036, initdb 자동 적용) 검증 — 테이블 존재 확인.
  const { rows: tables } = await pool.query(
    `SELECT to_regclass('sso_authorization_tickets') AS t`
  );
  check("마이그레이션 036 적용됨 (sso_authorization_tickets 존재)", tables[0]?.t !== null);

  const { rows: userRows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE is_active IS DISTINCT FROM FALSE LIMIT 1`
  );
  const userId = userRows[0]?.id;
  check("시드 사용자 존재", Boolean(userId));
  if (!userId) throw new Error("users 시드가 비어 있음");

  const input = {
    userId,
    clientId: "hanmir-erp-test",
    redirectUri: "https://erp.test.example/auth/sso/callback",
    stateHash: createHash("sha256").update("state-abcdefgh").digest("hex"),
    codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    ttlSec: 60
  };

  // 발급 → 저장소에는 해시만
  const issued = await repos.ssoTickets.issue(input);
  const rawHash = createHash("sha256").update(issued.ticket).digest("hex");
  const { rows: stored } = await pool.query<{ ticket_hash: string; consumed_at: Date | null }>(
    `SELECT ticket_hash, consumed_at FROM sso_authorization_tickets WHERE ticket_hash = $1`,
    [rawHash]
  );
  check(
    "DB 에 ticket 원문이 아닌 sha256 해시 저장",
    stored.length === 1 && stored[0].ticket_hash === rawHash && stored[0].ticket_hash !== issued.ticket
  );
  const { rows: rawSearch } = await pool.query(
    `SELECT 1 FROM sso_authorization_tickets WHERE ticket_hash = $1`,
    [issued.ticket.slice(0, 64).padEnd(64, "0")]
  );
  check("원문 값으로는 행 조회 불가", rawSearch.length === 0);

  // 동시 소비 — 풀의 서로 다른 커넥션에서 같은 ticket 을 병렬로 소비.
  const [c1, c2] = await Promise.all([
    repos.ssoTickets.consume(issued.ticket),
    repos.ssoTickets.consume(issued.ticket)
  ]);
  const winners = [c1, c2].filter(Boolean);
  check(
    "동시 소비 2건 → 정확히 1건만 성공 (조건부 UPDATE 원자성)",
    winners.length === 1 &&
      winners[0]!.userId === userId &&
      winners[0]!.clientId === input.clientId &&
      winners[0]!.redirectUri === input.redirectUri &&
      winners[0]!.codeChallenge === input.codeChallenge,
    `winners=${winners.length}`
  );

  // 재사용 — consumed_at 이 박힌 뒤에는 실패.
  const replay = await repos.ssoTickets.consume(issued.ticket);
  check("소비된 ticket 재사용 거부", replay === undefined);

  // 만료 — 발급 후 expires_at 을 과거로 되감고 소비 시도 (SQL 술어 검증).
  const expired = await repos.ssoTickets.issue(input);
  await pool.query(
    `UPDATE sso_authorization_tickets SET expires_at = NOW() - INTERVAL '5 seconds'
      WHERE ticket_hash = $1`,
    [createHash("sha256").update(expired.ticket).digest("hex")]
  );
  const expiredConsume = await repos.ssoTickets.consume(expired.ticket);
  check("만료 ticket 소비 거부 (expires_at > NOW())", expiredConsume === undefined);

  // 미지 ticket
  const unknown = await repos.ssoTickets.consume("never-issued-ticket-value-000000000000000000");
  check("미발급 ticket 거부", unknown === undefined);

  await pool.end();
  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("test-sso-pg harness crashed:", err);
  process.exit(1);
});
