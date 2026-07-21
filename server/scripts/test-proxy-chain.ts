// Cloudflare → (cloudflared 역할: 이 컨테이너) → Caddy → Express 체인 검증.
// test-proxy-chain.sh 가 같은 docker 네트워크에서 실행한다.
//
// 이 컨테이너는 사설 대역 피어라 Caddy 의 trusted_proxies 에 들어간다 —
// 운영에서 cloudflared 가 차지하는 자리와 동일. 따라서:
//   * CF-Connecting-IP 를 보내면 그 값이 실제 client IP 가 된다
//     (운영에서 이 헤더는 Cloudflare 엣지가 강제 설정 — 방문자 위조 불가)
//   * 방문자발 X-Forwarded-For 는 Caddy 가 {client_ip} 단일 값으로 덮어써
//     Express 까지 절대 그대로 도달하지 않는다
//   * CF 헤더가 없으면 피어(이 컨테이너) 주소로 안정 귀결
//
// TARGET 은 sh 가 http://caddy:80 으로 주입한다.

import { createHash, randomBytes } from "crypto";

const TARGET = process.env.TARGET ?? "http://caddy:80";
const TEST_CLIENT_ID = "hanmir-erp-test";

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
    redirect_uri: "https://erp.test.example/auth/sso/callback",
    state: `st-${randomBytes(9).toString("base64url")}`,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256"
  });
  return `/api/v1/auth/sso/authorize?${params.toString()}`;
}

async function req(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${TARGET}${path}`, { redirect: "manual", headers });
}

async function waitReady(): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await req("/api/v1/health");
      if (res.status === 200) return;
    } catch {
      // 기동 대기
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("chain (caddy → server) 이 60초 안에 준비되지 않음");
}

async function echoIp(headers: Record<string, string> = {}): Promise<string> {
  const res = await req("/api/v1/__test-ip", headers);
  const body = (await res.json()) as { ip?: string | null };
  return body.ip ?? "";
}

async function main(): Promise<void> {
  await waitReady();
  console.log(`\n■ 프록시 체인 (실제 Caddy ${TARGET})`);

  // 기준: 아무 헤더 없이 → Express 가 보는 IP = 이 컨테이너(피어) 주소.
  const peerIp = await echoIp();
  check("CF 헤더 없음 → 피어 주소로 귀결", Boolean(peerIp), `peer=${peerIp}`);

  const spoofedOnly = await echoIp({ "X-Forwarded-For": "9.9.9.9, 8.8.8.8" });
  check(
    "방문자발 XFF 만 있는 요청 → XFF 무시, 피어 주소 유지 (직접 XFF 신뢰 금지)",
    spoofedOnly === peerIp && spoofedOnly !== "9.9.9.9" && spoofedOnly !== "8.8.8.8",
    `ip=${spoofedOnly}`
  );

  const cfIp = await echoIp({ "CF-Connecting-IP": "203.0.113.60" });
  check("CF-Connecting-IP → 실제 client IP 로 채택", cfIp === "203.0.113.60", `ip=${cfIp}`);

  const cfPlusSpoof = await echoIp({
    "CF-Connecting-IP": "203.0.113.61",
    "X-Forwarded-For": "6.6.6.6, 7.7.7.7"
  });
  check(
    "CF 헤더 + 위조 XFF 동시 → CF 값만 채택 (XFF 는 Caddy 가 덮어씀)",
    cfPlusSpoof === "203.0.113.61",
    `ip=${cfPlusSpoof}`
  );

  // 같은 CF IP 35회 + 매번 다른 위조 XFF → 30 허용 + 5×429.
  {
    const statuses: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const res = await req(authorizePath(), {
        "CF-Connecting-IP": "203.0.113.50",
        "X-Forwarded-For": `1.2.3.${i}`
      });
      statuses.push(res.status);
    }
    const allowed = statuses.filter((s) => s !== 429).length;
    check(
      "같은 CF IP 35회(매번 다른 위조 XFF) → 정확히 30 허용 + 5×429",
      allowed === 30 && statuses.slice(30).every((s) => s === 429),
      `allowed=${allowed} statuses30+=${statuses.slice(30).join(",")}`
    );
  }
  {
    const res = await req(authorizePath(), { "CF-Connecting-IP": "203.0.113.51" });
    check("다른 정상 CF IP 는 별도 버킷 (즉시 허용)", res.status === 302, `status=${res.status}`);
  }
  // CF 헤더 없는 요청은 피어 버킷으로 안정 집계 — 35회 → 30 허용 + 5×429.
  {
    const statuses: number[] = [];
    for (let i = 0; i < 35; i += 1) {
      const res = await req(authorizePath());
      statuses.push(res.status);
    }
    const allowed = statuses.filter((s) => s !== 429).length;
    check(
      "CF 헤더 없음 35회 → 피어 버킷으로 30 허용 + 5×429",
      allowed === 30 && statuses.filter((s) => s === 429).length === 5,
      `allowed=${allowed}`
    );
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("test-proxy-chain harness crashed:", err);
  process.exit(1);
});
