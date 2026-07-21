// Client-IP trust boundary — integration tests at the Express layer.
//
// Parent run (TRUST_PROXY_HOPS=1, production semantics): the test client
// plays the role of Caddy — the socket peer is the single trusted hop and
// X-Forwarded-For carries the one normalized value Caddy would pin. Verifies:
//   * SSO authorize limit: 35 hits per IP → exactly 30 allowed + 5×429
//   * per-request XFF spoof prefixes cannot escape the pinned bucket
//   * distinct legitimate client IPs get distinct buckets
//   * header-less requests aggregate stably on the socket peer
//   * the audit log records the very same resolved IP
//   * login brute-force limiter regression (per-account reset on success)
//
// Child run (--hops0, TRUST_PROXY_HOPS=0, dev/direct-exposure semantics):
// X-Forwarded-For is ignored outright — rotating forged headers still lands
// in the socket-peer bucket, so direct callers cannot dodge rate limits.
//
// The full Cloudflare-header path (CF-Connecting-IP → Caddy → Express) is
// covered end-to-end by test-proxy-chain.sh with a real Caddy container.
//
// Run:
//   docker run --rm -u $(id -u):$(id -g) -v /srv/hanmir-talk:/app -w /app \
//     -e HOME=/tmp node:20-alpine npx tsx server/scripts/test-client-ip.ts

import { spawnSync } from "child_process";
import { createHash, randomBytes } from "crypto";
import type { AddressInfo } from "net";

const CHILD_FLAG = "--hops0";
const isChild = process.argv.includes(CHILD_FLAG);

const TEST_CLIENT_ID = "hanmir-erp-test";
const TEST_CLIENT_SECRET = "test-only-dummy-secret-not-real-0000000000";
const CALLBACK = "https://erp.test.example/auth/sso/callback";
process.env.SSO_CLIENTS = JSON.stringify([
  {
    clientId: TEST_CLIENT_ID,
    name: "HanmirERP (test)",
    secretSha256: createHash("sha256").update(TEST_CLIENT_SECRET).digest("hex"),
    redirectUris: [CALLBACK]
  }
]);
process.env.TRUST_PROXY_HOPS = isChild ? "0" : "1";
// 기본 한도(30/분)를 그대로 검증하는 하네스 — 오버라이드 금지.
delete process.env.SSO_AUTHORIZE_RATE_PER_MIN;
delete process.env.SSO_EXCHANGE_RATE_PER_MIN;
delete process.env.CORS_ORIGIN;
delete process.env.DATABASE_URL;

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

function authorizePath(): string {
  const verifier = randomBytes(48).toString("base64url");
  const params = new URLSearchParams({
    client_id: TEST_CLIENT_ID,
    redirect_uri: CALLBACK,
    state: `st-${randomBytes(9).toString("base64url")}`,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256"
  });
  return `/api/v1/auth/sso/authorize?${params.toString()}`;
}

async function main(): Promise<void> {
  const { createApp } = await import("../src/app");
  const { createMemoryRepositories } = await import("../src/repositories/memory");
  const { config } = await import("../src/config");

  const repos = createMemoryRepositories();
  const app = createApp({ repos });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const req = async (
    path: string,
    opts: { xff?: string; method?: string; body?: unknown } = {}
  ): Promise<Response> =>
    fetch(`${base}${path}`, {
      method: opts.method ?? "GET",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.xff !== undefined ? { "X-Forwarded-For": opts.xff } : {})
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    });
  const badLogin = (email: string, xff?: string) =>
    req("/api/v1/auth/login", { method: "POST", xff, body: { email, password: "definitely-wrong" } });
  const goodLogin = (email: string, xff?: string) =>
    req("/api/v1/auth/login", { method: "POST", xff, body: { email, password: config.defaultPassword } });
  const auditData = () => (repos.audit as unknown as { data: Array<{ action: string; ip?: string }> }).data;

  if (isChild) {
    // ── TRUST_PROXY_HOPS=0: 직접 노출 환경 — XFF 전면 무시 ──
    console.log(`\n■ TRUST_PROXY_HOPS=0 (직접 호출) — XFF 무시`);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      // 매 요청 다른 위조 XFF — 무시된다면 소켓(127.0.0.1) 버킷 하나에 쌓인다.
      const res = await badLogin("yoon.seoyeon@hanmir.co.kr", `10.9.9.${i}`);
      statuses.push(res.status);
    }
    check(
      "위조 XFF 를 매번 바꿔도 6번째 로그인 시도 → 429 (소켓 피어 버킷)",
      statuses.slice(0, 5).every((s) => s === 401) && statuses[5] === 429,
      `statuses=${statuses.join(",")}`
    );
    // 감사 로그도 XFF 가 아니라 소켓 피어를 기록해야 한다 (admin 실패 감사).
    await badLogin("kang.eunhye@hanmir.co.kr", "203.0.113.99");
    const entry = auditData().find((e) => e.action === "auth.login.failure");
    check(
      "감사 로그 IP = 소켓 피어 (위조 XFF 아님)",
      Boolean(entry?.ip) && entry!.ip!.includes("127.0.0.1") && entry!.ip !== "203.0.113.99",
      `ip=${entry?.ip}`
    );
    server.close();
    console.log(`\n(child) 결과: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
  }

  // ── TRUST_PROXY_HOPS=1: 운영 시맨틱 — Caddy 가 고정한 단일 XFF 값 신뢰 ──
  console.log(`\n■ TRUST_PROXY_HOPS=1 — SSO authorize 레이트리밋`);
  {
    const statuses: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const res = await req(authorizePath(), { xff: "203.0.113.7" });
      statuses.push(res.status);
    }
    const allowed = statuses.filter((s) => s !== 429).length;
    const limited = statuses.filter((s) => s === 429).length;
    check(
      "같은 클라이언트 IP 35회 → 정확히 30 허용 + 5×429",
      allowed === 30 && limited === 5 && statuses.slice(30).every((s) => s === 429),
      `allowed=${allowed} limited=${limited}`
    );
  }
  {
    // Caddy 가 마지막 값을 고정하는 구조에서, 공격자가 체인 앞부분에 임의
    // 값을 밀어넣어도(매번 다른 스푸핑) 버킷은 고정 값 하나로 유지된다.
    const statuses: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const res = await req(authorizePath(), { xff: `1.2.${i}.${i + 1}, 203.0.113.20` });
      statuses.push(res.status);
    }
    const allowed = statuses.filter((s) => s !== 429).length;
    check(
      "매 요청 다른 XFF 스푸핑 접두부 → 우회 불가 (30 허용 + 5×429)",
      allowed === 30 && statuses.filter((s) => s === 429).length === 5,
      `allowed=${allowed}`
    );
  }
  {
    const res = await req(authorizePath(), { xff: "203.0.113.21" });
    check("다른 정상 클라이언트 IP 는 별도 버킷 (즉시 허용)", res.status === 302, `status=${res.status}`);
  }
  {
    // 헤더 없는 요청(내부 smoke 등)은 소켓 피어로 안정 집계.
    const statuses: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const res = await req(authorizePath());
      statuses.push(res.status);
    }
    const allowed = statuses.filter((s) => s !== 429).length;
    check(
      "XFF 없는 요청 35회 → 소켓 피어 버킷으로 30 허용 + 5×429",
      allowed === 30 && statuses.filter((s) => s === 429).length === 5,
      `allowed=${allowed}`
    );
  }

  console.log(`\n■ 감사 로그 IP 일치`);
  {
    // admin 로그인 성공/실패는 감사 대상 — 기록 IP 가 판정 IP 와 같아야 한다.
    await badLogin("kang.eunhye@hanmir.co.kr", "198.51.100.77");
    const failEntry = auditData().find((e) => e.action === "auth.login.failure");
    check("auth.login.failure 감사 IP = 판정 IP", failEntry?.ip === "198.51.100.77", `ip=${failEntry?.ip}`);

    const ok = await goodLogin("kang.eunhye@hanmir.co.kr", "198.51.100.77");
    const successEntry = auditData().find((e) => e.action === "auth.login.success");
    check(
      "auth.login.success 감사 IP = 판정 IP",
      ok.status === 200 && successEntry?.ip === "198.51.100.77",
      `status=${ok.status} ip=${successEntry?.ip}`
    );

    // SSO authorize 감사도 동일 판정 사용 — 로그인 쿠키로 티켓 발급.
    const cookies = ok.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const authz = await fetch(`${base}${authorizePath()}`, {
      redirect: "manual",
      headers: { Cookie: cookies, "X-Forwarded-For": "198.51.100.78" }
    });
    const ssoEntry = auditData().find((e) => e.action === "auth.sso.authorize");
    check(
      "auth.sso.authorize 감사 IP = 판정 IP",
      authz.status === 302 && ssoEntry?.ip === "198.51.100.78",
      `status=${authz.status} ip=${ssoEntry?.ip}`
    );
  }

  console.log(`\n■ 로그인 브루트포스 리미터 회귀 (프록시 IP 기준)`);
  {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const res = await badLogin("park.jiyoung@hanmir.co.kr", "198.51.100.10");
      statuses.push(res.status);
    }
    check(
      "IP×계정 5회 초과 → 429",
      statuses.slice(0, 5).every((s) => s === 401) && statuses.slice(5).every((s) => s === 429),
      `statuses=${statuses.join(",")}`
    );
    const other = await badLogin("park.jiyoung@hanmir.co.kr", "198.51.100.11");
    check("다른 IP 는 같은 계정이라도 별도 버킷", other.status === 401, `status=${other.status}`);

    // 성공 로그인은 해당 IP×계정 카운터를 초기화 (기존 동작 회귀).
    await badLogin("kim.minjun@hanmir.co.kr", "198.51.100.12");
    await badLogin("kim.minjun@hanmir.co.kr", "198.51.100.12");
    const good = await goodLogin("kim.minjun@hanmir.co.kr", "198.51.100.12");
    const badAfter = await badLogin("kim.minjun@hanmir.co.kr", "198.51.100.12");
    check(
      "성공 로그인 후 카운터 초기화 (오타 누적이 이월되지 않음)",
      good.status === 200 && badAfter.status === 401,
      `good=${good.status} after=${badAfter.status}`
    );
  }

  server.close();

  console.log(`\n■ TRUST_PROXY_HOPS=0 하위 프로세스`);
  const child = spawnSync("npx", ["tsx", process.argv[1], CHILD_FLAG], {
    encoding: "utf8",
    env: { ...process.env, TRUST_PROXY_HOPS: "0" }
  });
  process.stdout.write(child.stdout ?? "");
  if (child.stderr) process.stderr.write(child.stderr);
  check("hops=0 하위 프로세스 전부 PASS", child.status === 0, `exit=${child.status}`);

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("test-client-ip harness crashed:", err);
  process.exit(1);
});
