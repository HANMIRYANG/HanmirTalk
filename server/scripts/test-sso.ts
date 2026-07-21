// HanmirERP SSO — integration test harness (memory adapter, real HTTP).
//
// Boots the actual Express app on an ephemeral port and drives the full
// authorize → login-detour → exchange lifecycle plus the pre-existing
// login/logout/refresh/me/bounce regressions, asserting every negative path
// required by the SSO contract (docs/HANMIR_ERP_SSO_CONTRACT.md).
//
// Run (host has no node — use a throwaway container):
//   docker run --rm -u $(id -u):$(id -g) -v /srv/hanmir-talk:/app -w /app \
//     -e HOME=/tmp node:20-alpine npx tsx server/scripts/test-sso.ts
//
// The client secret below is a TEST-ONLY dummy value, never a real credential.

import { createHash, randomBytes } from "crypto";
import type { AddressInfo } from "net";

// ── test client registration (must be set BEFORE importing server modules —
//    auth/sso.ts parses SSO_CLIENTS at module load) ─────────────────────────
const TEST_CLIENT_ID = "hanmir-erp-test";
const TEST_CLIENT_SECRET = "test-only-dummy-secret-not-real-0000000000";
const CALLBACK_A = "https://erp.test.example/auth/sso/callback";
const CALLBACK_B = "https://erp.test.example/auth/sso/alt-callback";
process.env.SSO_CLIENTS = JSON.stringify([
  {
    clientId: TEST_CLIENT_ID,
    name: "HanmirERP (test)",
    secretSha256: createHash("sha256").update(TEST_CLIENT_SECRET).digest("hex"),
    redirectUris: [CALLBACK_A, CALLBACK_B]
  }
]);
process.env.SSO_TICKET_TTL_SEC = "60";
// 이 하네스는 authorize/exchange 를 수십 회 호출한다 — 기본 30/분 한도에
// 걸리지 않게 넉넉히 올린다. 한도 자체(35→30+429)와 IP 버킷 분리는
// test-client-ip.ts / test-proxy-chain 이 기본값으로 검증한다.
process.env.SSO_AUTHORIZE_RATE_PER_MIN = "500";
process.env.SSO_EXCHANGE_RATE_PER_MIN = "500";
delete process.env.CORS_ORIGIN; // default http://localhost:3000 → webUrl base
delete process.env.DATABASE_URL; // 절대 실 DB 를 붙이지 않는다 — memory adapter 강제
delete process.env.TRUST_PROXY_HOPS; // 기본 0 — XFF 무시 경로로 회귀 검증

const WEB_ORIGIN = "http://localhost:3000";
const API_PREFIX = "/api/v1";

// ── tiny assertion harness ──────────────────────────────────────────────────
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

// ── minimal cookie jar (Path-aware, enough for hanmir_token/_refresh) ──────
class Jar {
  private cookies = new Map<string, { value: string; path: string }>();

  absorb(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const name = pair.slice(0, eq);
      const value = decodeURIComponent(pair.slice(eq + 1));
      const pathAttr = attrs.find((a) => a.toLowerCase().startsWith("path="));
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith("max-age="));
      const path = pathAttr ? pathAttr.slice(5) : "/";
      const expired = maxAge !== undefined && Number(maxAge.slice(8)) <= 0;
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, { value, path });
    }
  }

  headerFor(reqPath: string): string | undefined {
    const sent: string[] = [];
    for (const [name, c] of this.cookies) {
      const p = c.path.endsWith("/") ? c.path.slice(0, -1) : c.path;
      if (p === "" || reqPath === p || reqPath.startsWith(`${p}/`) || reqPath.startsWith(`${p}?`)) {
        sent.push(`${name}=${encodeURIComponent(c.value)}`);
      }
    }
    return sent.length ? sent.join("; ") : undefined;
  }

  get(name: string): string | undefined {
    return this.cookies.get(name)?.value;
  }
}

async function main(): Promise<void> {
  // Import AFTER env setup so config/sso registry see the test values.
  const { createApp } = await import("../src/app");
  const { createMemoryRepositories } = await import("../src/repositories/memory");
  const { config } = await import("../src/config");

  const repos = createMemoryRepositories();
  const app = createApp({ repos });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const http = async (
    jar: Jar | undefined,
    method: string,
    path: string,
    opts: { body?: string; contentType?: string } = {}
  ): Promise<Response> => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.contentType) headers["Content-Type"] = opts.contentType;
    const cookie = jar?.headerFor(path);
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: opts.body,
      redirect: "manual"
    });
    jar?.absorb(res);
    return res;
  };
  const json = (jar: Jar | undefined, method: string, path: string, body: unknown) =>
    http(jar, method, path, { body: JSON.stringify(body), contentType: "application/json" });
  const form = (jar: Jar | undefined, method: string, path: string, fields: Record<string, string>) =>
    http(jar, method, path, {
      body: new URLSearchParams(fields).toString(),
      contentType: "application/x-www-form-urlencoded"
    });

  const PASSWORD = config.defaultPassword; // memory adapter seeds bcrypt(this)
  const USER = { id: "u-park-jiyoung", email: "park.jiyoung@hanmir.co.kr" };

  const pkcePair = () => {
    const verifier = randomBytes(48).toString("base64url");
    return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
  };
  const authorizePath = (over: Record<string, string | undefined> = {}): string => {
    const params = new URLSearchParams();
    const defaults: Record<string, string> = {
      client_id: TEST_CLIENT_ID,
      redirect_uri: CALLBACK_A,
      state: "st-0123456789-ABC~._-",
      code_challenge: pkcePair().challenge,
      code_challenge_method: "S256"
    };
    for (const [k, v] of Object.entries({ ...defaults, ...over })) {
      if (v !== undefined) params.set(k, v);
    }
    return `${API_PREFIX}/auth/sso/authorize?${params.toString()}`;
  };
  const login = async (jar: Jar, email = USER.email): Promise<Response> =>
    json(jar, "POST", `${API_PREFIX}/auth/login`, { email, password: PASSWORD });
  // Full happy authorize with a fresh PKCE pair; returns code + verifier.
  const obtainCode = async (
    jar: Jar,
    state = `st-${randomBytes(9).toString("base64url")}`
  ): Promise<{ code: string; state: string; verifier: string }> => {
    const { verifier, challenge } = pkcePair();
    const res = await http(jar, "GET", authorizePath({ state, code_challenge: challenge }));
    if (res.status !== 302) throw new Error(`authorize expected 302, got ${res.status}`);
    const loc = new URL(res.headers.get("location") ?? "");
    const code = loc.searchParams.get("code") ?? "";
    if (!code) throw new Error(`authorize redirect carried no code: ${loc}`);
    return { code, state, verifier };
  };
  const exchangeFields = (
    code: string,
    verifier: string,
    over: Record<string, string> = {}
  ): Record<string, string> => ({
    grant_type: "authorization_code",
    client_id: TEST_CLIENT_ID,
    client_secret: TEST_CLIENT_SECRET,
    code,
    redirect_uri: CALLBACK_A,
    code_verifier: verifier,
    ...over
  });

  // ════ 1. 기존 인증 회귀 — login / me / refresh / logout / bounce ════
  console.log("\n■ 기존 인증 회귀");
  {
    const jar = new Jar();
    const bad = await json(jar, "POST", `${API_PREFIX}/auth/login`, {
      email: USER.email,
      password: "definitely-wrong"
    });
    check("login: 잘못된 비밀번호 → 401", bad.status === 401);

    const ok = await login(jar);
    const body = (await ok.json()) as { ok?: boolean; user?: { id?: string } };
    check("login: 성공 → 200 + user", ok.status === 200 && body.ok === true && body.user?.id === USER.id);
    check(
      "login: hanmir_token + hanmir_refresh 쿠키 발급",
      Boolean(jar.get("hanmir_token")) && Boolean(jar.get("hanmir_refresh"))
    );

    const me = await http(jar, "GET", `${API_PREFIX}/auth/me`);
    const meBody = (await me.json()) as { email?: string };
    check("me: 세션으로 본인 조회", me.status === 200 && meBody.email === USER.email);

    const oldRefresh = jar.get("hanmir_refresh");
    const refreshed = await http(jar, "POST", `${API_PREFIX}/auth/refresh`);
    check(
      "refresh: 200 + 리프레시 회전(새 토큰)",
      refreshed.status === 200 && Boolean(jar.get("hanmir_refresh")) && jar.get("hanmir_refresh") !== oldRefresh
    );

    const me2 = await http(jar, "GET", `${API_PREFIX}/auth/me`);
    check("refresh 후 me 정상", me2.status === 200);

    const out = await http(jar, "POST", `${API_PREFIX}/auth/logout`);
    check("logout: 200 + 쿠키 삭제", out.status === 200 && !jar.get("hanmir_token") && !jar.get("hanmir_refresh"));

    const me3 = await http(jar, "GET", `${API_PREFIX}/auth/me`);
    check("logout 후 me → 401", me3.status === 401);
  }
  {
    const jar = new Jar();
    const cold = await http(jar, "GET", `${API_PREFIX}/auth/bounce?next=%2Fdashboard`);
    check(
      "bounce: 쿠키 없음 → 302 /login",
      cold.status === 302 && (cold.headers.get("location") ?? "") === `${WEB_ORIGIN}/login`
    );

    await login(jar);
    const bounced = await http(jar, "GET", `${API_PREFIX}/auth/bounce?next=%2Fdashboard`);
    check(
      "bounce: 유효 리프레시 → 302 next 복귀",
      bounced.status === 302 && (bounced.headers.get("location") ?? "") === `${WEB_ORIGIN}/dashboard`
    );
    const evil = await http(jar, "GET", `${API_PREFIX}/auth/bounce?next=${encodeURIComponent("//evil.com")}`);
    check(
      "bounce: next=//evil.com → / 로 강제 (open redirect 차단)",
      evil.status === 302 && (evil.headers.get("location") ?? "") === `${WEB_ORIGIN}/`
    );
  }

  // ════ 2. SSO authorize ════
  console.log("\n■ SSO authorize");
  {
    const jar = new Jar(); // 미로그인 브라우저
    const res = await http(jar, "GET", authorizePath());
    const loc = res.headers.get("location") ?? "";
    const nextParam = loc.includes("next=") ? decodeURIComponent(loc.split("next=")[1]) : "";
    check(
      "미로그인 → 302 /login?next=<authorize 경로>",
      res.status === 302 &&
        loc.startsWith(`${WEB_ORIGIN}/login?next=`) &&
        nextParam.startsWith(`${API_PREFIX}/auth/sso/authorize?`) &&
        nextParam.includes(`client_id=${TEST_CLIENT_ID}`)
    );

    // 로그인 후 next 경로 그대로 재진입 → 티켓 발급 (로그인 복귀 왕복)
    await login(jar);
    const resumed = await http(jar, "GET", nextParam);
    const resumedLoc = resumed.status === 302 ? new URL(resumed.headers.get("location") ?? "") : undefined;
    check(
      "로그인 후 authorize 복귀 → redirect_uri 로 code+state",
      Boolean(resumedLoc) &&
        `${resumedLoc!.origin}${resumedLoc!.pathname}` === CALLBACK_A &&
        Boolean(resumedLoc!.searchParams.get("code")) &&
        resumedLoc!.searchParams.get("state") === "st-0123456789-ABC~._-"
    );
  }
  const browser = new Jar(); // 이후 시나리오 공용 로그인 브라우저
  await login(browser);
  {
    const state = "state-~._-0123456789xyz";
    const issued = await obtainCode(browser, state);
    check(
      "state 원본 그대로 echo + code 는 base64url 43자",
      issued.state === state && /^[A-Za-z0-9_-]{43}$/.test(issued.code)
    );

    const unknownClient = await http(browser, "GET", authorizePath({ client_id: "nope" }));
    check(
      "미등록 client_id → 400 + 리다이렉트 없음",
      unknownClient.status === 400 && !unknownClient.headers.get("location")
    );

    for (const uri of [
      `${CALLBACK_A}/extra`,
      "https://erp.test.example.evil.com/auth/sso/callback",
      "https://erp.test.example:8443/auth/sso/callback",
      "http://erp.test.example/auth/sso/callback",
      "//evil.com"
    ]) {
      const res = await http(browser, "GET", authorizePath({ redirect_uri: uri }));
      check(
        `미등록 redirect_uri 거부(정확 일치): ${uri}`,
        res.status === 400 && !res.headers.get("location")
      );
    }

    const shortState = await http(browser, "GET", authorizePath({ state: "short" }));
    const shortLoc = shortState.status === 302 ? new URL(shortState.headers.get("location") ?? "") : undefined;
    check(
      "state 8자 미만 → 등록 redirect 로 error=invalid_request",
      Boolean(shortLoc) &&
        `${shortLoc!.origin}${shortLoc!.pathname}` === CALLBACK_A &&
        shortLoc!.searchParams.get("error") === "invalid_request" &&
        !shortLoc!.searchParams.get("code")
    );

    const plain = await http(browser, "GET", authorizePath({ code_challenge_method: "plain" }));
    const plainLoc = plain.status === 302 ? new URL(plain.headers.get("location") ?? "") : undefined;
    check(
      "code_challenge_method=plain 거부",
      Boolean(plainLoc) && plainLoc!.searchParams.get("error") === "invalid_request"
    );
  }

  // ════ 3. SSO exchange ════
  console.log("\n■ SSO exchange");
  let happySub = "";
  {
    const { code, verifier } = await obtainCode(browser);
    const res = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, verifier));
    const body = (await res.json()) as Record<string, unknown>;
    happySub = String(body.sub ?? "");
    check(
      "교환 성공(form-urlencoded) → identity JSON",
      res.status === 200 &&
        body.ok === true &&
        body.sub === USER.id &&
        body.email === USER.email &&
        typeof body.name === "string" &&
        typeof body.departmentId === "string" &&
        body.isActive === true &&
        typeof body.issuedAt === "string" &&
        typeof body.expiresAt === "string"
    );
    check(
      "응답에 role·토큰류 없음 (identity only)",
      !("role" in body) && !("token" in body) && !("accessToken" in body) && !("refreshToken" in body)
    );

    const reuse = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, verifier));
    const reuseBody = (await reuse.json()) as { error?: string };
    check("ticket 재사용 → 400 invalid_grant", reuse.status === 400 && reuseBody.error === "invalid_grant");
  }
  {
    const { code, verifier } = await obtainCode(browser);
    const wrongSecret = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`,
      exchangeFields(code, verifier, { client_secret: "wrong-secret-value" }));
    const wrongBody = (await wrongSecret.json()) as { error?: string };
    check("잘못된 client_secret → 401 invalid_client", wrongSecret.status === 401 && wrongBody.error === "invalid_client");

    const after = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, verifier));
    check("secret 실패는 ticket 을 태우지 않음 → 정상 secret 재시도 성공", after.status === 200);
  }
  {
    const { code } = await obtainCode(browser);
    const bad = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`,
      exchangeFields(code, randomBytes(48).toString("base64url")));
    const badBody = (await bad.json()) as { error?: string };
    check("PKCE verifier 불일치 → invalid_grant (ticket 소각)", bad.status === 400 && badBody.error === "invalid_grant");
  }
  {
    const { code, verifier } = await obtainCode(browser);
    const mismatch = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`,
      exchangeFields(code, verifier, { redirect_uri: CALLBACK_B }));
    const body = (await mismatch.json()) as { error?: string };
    check("redirect_uri 바인딩 불일치(등록된 다른 URI) → invalid_grant", mismatch.status === 400 && body.error === "invalid_grant");
  }
  {
    const { code, verifier } = await obtainCode(browser);
    const badClient = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`,
      exchangeFields(code, verifier, { client_id: "someone-else", client_secret: TEST_CLIENT_SECRET }));
    check("미등록 client_id 교환 → 401 invalid_client", badClient.status === 401);

    const badGrant = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`,
      exchangeFields(code, verifier, { grant_type: "password" }));
    const badGrantBody = (await badGrant.json()) as { error?: string };
    check("grant_type≠authorization_code → unsupported_grant_type",
      badGrant.status === 400 && badGrantBody.error === "unsupported_grant_type");

    // JSON body 도 동일하게 동작 (아직 살아있는 ticket 으로 마무리 교환)
    const viaJson = await json(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, verifier));
    check("교환 성공(JSON body)", viaJson.status === 200);
  }

  // 만료 ticket — 정상 발급 후 저장 행의 expires_at 을 과거로 되감아
  // consume 의 만료 술어를 검증한다 (PG 는 같은 조건이 SQL 의
  // `expires_at > NOW()` 로 들어가 있다). config 변조는 tsx 의 모듈
  // 이중 인스턴스 때문에 라우트에 전파되지 않아 쓰지 않는다.
  {
    const { code, verifier } = await obtainCode(browser);
    const ticketRows = (repos.ssoTickets as unknown as { rows: Map<string, { expiresAt: Date }> }).rows;
    const hash = createHash("sha256").update(code).digest("hex");
    const row = ticketRows.get(hash);
    if (row) row.expiresAt = new Date(Date.now() - 5000);
    const res = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, verifier));
    const body = (await res.json()) as { error?: string };
    check(
      "만료 ticket → invalid_grant",
      Boolean(row) && res.status === 400 && body.error === "invalid_grant",
      row ? `status=${res.status}` : "저장 행을 찾지 못함"
    );
  }

  // 비활성 사용자 — 교환 시점 재검증
  {
    const jar = new Jar();
    await login(jar, "han.jisu@hanmir.co.kr");
    const { code, verifier } = await obtainCode(jar);
    await repos.users.deactivate("u-han-jisu");
    const res = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, verifier));
    const body = (await res.json()) as { error?: string };
    check("발급 후 비활성화된 사용자 교환 → invalid_grant", res.status === 400 && body.error === "invalid_grant");
  }
  // 비활성 사용자 — 발급 시점 재검증 (로그인 세션은 살아있는 상태)
  {
    const jar = new Jar();
    await login(jar, "yoon.seoyeon@hanmir.co.kr");
    await repos.users.deactivate("u-yoon-seoyeon");
    const res = await http(jar, "GET", authorizePath());
    const loc = res.status === 302 ? new URL(res.headers.get("location") ?? "") : undefined;
    check(
      "비활성 사용자 authorize → error=access_denied (ticket 미발급)",
      Boolean(loc) &&
        `${loc!.origin}${loc!.pathname}` === CALLBACK_A &&
        loc!.searchParams.get("error") === "access_denied" &&
        !loc!.searchParams.get("code")
    );
  }

  // 동시 교환 — 정확히 1건만 성공
  {
    const { code, verifier } = await obtainCode(browser);
    const fields = exchangeFields(code, verifier);
    const [r1, r2] = await Promise.all([
      form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, fields),
      form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, fields)
    ]);
    const statuses = [r1.status, r2.status].sort();
    check("동시 교환 2건 → 정확히 1건만 200", statuses[0] === 200 && statuses[1] === 400,
      `got ${statuses.join(",")}`);
  }

  // access 만료 + refresh 유효 → authorize 가 조용히 회전 복구
  {
    const jar = new Jar();
    await login(jar);
    const { sessionStore } = await import("../src/auth/session");
    const access = jar.get("hanmir_token");
    if (access) sessionStore.revoke(access); // 서버 재시작/만료 시뮬레이션
    const { verifier, challenge } = pkcePair();
    const res = await http(jar, "GET", authorizePath({ code_challenge: challenge }));
    const loc = res.status === 302 ? new URL(res.headers.get("location") ?? "") : undefined;
    const code = loc?.searchParams.get("code") ?? "";
    check(
      "access 만료+refresh 유효 → 재로그인 없이 ticket 발급 (rotation 재사용)",
      Boolean(code) && Boolean(jar.get("hanmir_token")),
      `status=${res.status}`
    );
    if (code) {
      const ex = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, verifier));
      check("회전 복구로 발급된 ticket 교환 성공", ex.status === 200);
    }
  }

  // ════ 4. 저장·로그 위생 ════
  console.log("\n■ 저장·로그 위생");
  {
    const { code, verifier } = await obtainCode(browser);
    const ticketRows = (repos.ssoTickets as unknown as { rows: Map<string, unknown> }).rows;
    const keys = [...ticketRows.keys()];
    check(
      "저장소에는 sha256 해시만 존재 (ticket 원문 없음)",
      keys.length > 0 && keys.every((k) => /^[0-9a-f]{64}$/.test(k)) && !keys.includes(code)
    );
    const auditRaw = JSON.stringify((repos.audit as unknown as { data: unknown[] }).data);
    check(
      "감사 로그에 ticket/secret 원문 없음",
      !auditRaw.includes(code) && !auditRaw.includes(TEST_CLIENT_SECRET)
    );
    check(
      "감사 로그에 sso authorize/exchange 기록 존재",
      auditRaw.includes("auth.sso.authorize") && auditRaw.includes("auth.sso.exchange")
    );
    // 마무리: 얻어둔 코드는 소비해 잔여물 없이 종료
    await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, verifier));
  }

  // ════ 5. PKCE 검증 규칙 — S256 challenge 는 verifier 와 다른 규칙 ════
  console.log("\n■ PKCE 검증 규칙");
  {
    const { isValidCodeChallenge, isValidCodeVerifier } = await import("../src/auth/sso");
    const b64u = (n: number) => "A".repeat(n); // base64url 합법 문자로 길이만 조절

    check("challenge: 정상 S256 산출값(43자 base64url) 통과",
      isValidCodeChallenge(pkcePair().challenge));
    check("challenge: 42자 거부", !isValidCodeChallenge(b64u(42)));
    check("challenge: 44자 거부", !isValidCodeChallenge(b64u(44)));
    check("challenge: 128자 거부", !isValidCodeChallenge(b64u(128)));
    check("challenge: '.' 포함 거부", !isValidCodeChallenge(`${b64u(42)}.`));
    check("challenge: '~' 포함 거부", !isValidCodeChallenge(`${b64u(42)}~`));
    check("challenge: '=' padding 거부", !isValidCodeChallenge(`${b64u(42)}=`));
    check("challenge: '-'/'_' 포함 base64url 43자 허용",
      isValidCodeChallenge(`${b64u(41)}-_`));

    check("verifier: 43자·128자 허용 ('-._~' 포함)",
      isValidCodeVerifier(`${"a".repeat(39)}-._~`) && isValidCodeVerifier("b".repeat(128)));
    check("verifier: 42자·129자 거부",
      !isValidCodeVerifier("a".repeat(42)) && !isValidCodeVerifier("a".repeat(129)));
    check("verifier: 금지 문자('+','=') 거부",
      !isValidCodeVerifier(`${"a".repeat(42)}+`) && !isValidCodeVerifier(`${"a".repeat(42)}=`));
  }
  {
    // authorize 흐름에서도 verifier 형태(길이 43~128, '.~' 포함)의 challenge
    // 는 이제 거부된다 — S256 산출값이 아니므로.
    const badChallenges: Array<[string, string]> = [
      ["길이 42", "A".repeat(42)],
      ["길이 44", "A".repeat(44)],
      ["길이 128", "A".repeat(128)],
      ["'.' 포함 43자", `${"A".repeat(42)}.`],
      ["'~' 포함 43자", `${"A".repeat(42)}~`],
      ["'=' padding 43자", `${"A".repeat(42)}=`]
    ];
    for (const [label, badChallenge] of badChallenges) {
      const res = await http(browser, "GET", authorizePath({ code_challenge: badChallenge }));
      const loc = res.status === 302 ? new URL(res.headers.get("location") ?? "") : undefined;
      check(
        `authorize: 비정상 challenge(${label}) → error=invalid_request`,
        Boolean(loc) &&
          loc!.searchParams.get("error") === "invalid_request" &&
          !loc!.searchParams.get("code")
      );
    }
    // '-'와 '_'가 실제로 포함된 challenge 로 전체 흐름 성공 — 자연 발생
    // 확률이 높으므로 (각 문자 등장 확률 ~75%) 몇 번 뽑아서 찾는다.
    let pair = pkcePair();
    for (let i = 0; i < 500 && !(pair.challenge.includes("-") && pair.challenge.includes("_")); i += 1) {
      pair = pkcePair();
    }
    if (pair.challenge.includes("-") && pair.challenge.includes("_")) {
      const state = `st-${randomBytes(9).toString("base64url")}`;
      const res = await http(browser, "GET", authorizePath({ state, code_challenge: pair.challenge }));
      const loc = res.status === 302 ? new URL(res.headers.get("location") ?? "") : undefined;
      const code = loc?.searchParams.get("code") ?? "";
      const ex = code
        ? await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, pair.verifier))
        : undefined;
      check("'-','_' 포함 정상 challenge 로 발급+교환 성공", ex?.status === 200,
        `authorize=${res.status} exchange=${ex?.status ?? "-"}`);
    } else {
      check("'-','_' 포함 정상 challenge 로 발급+교환 성공", false, "샘플 생성 실패(500회)");
    }
    // verifier 경계: 43자·128자('-._~' 포함) 는 exchange 를 통과해야 한다.
    for (const verifier of [`${"v".repeat(39)}-._~`, "w".repeat(128)]) {
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const state = `st-${randomBytes(9).toString("base64url")}`;
      const res = await http(browser, "GET", authorizePath({ state, code_challenge: challenge }));
      const loc = res.status === 302 ? new URL(res.headers.get("location") ?? "") : undefined;
      const code = loc?.searchParams.get("code") ?? "";
      const ex = code
        ? await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, verifier))
        : undefined;
      check(`verifier 경계(${verifier.length}자) 교환 성공`, ex?.status === 200);
    }
    // verifier 길이 위반은 invalid_request (ticket 소비 전 형식 검증).
    const { code, verifier } = await obtainCode(browser);
    const short = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`,
      exchangeFields(code, verifier, { code_verifier: "x".repeat(42) }));
    const shortBody = (await short.json()) as { error?: string };
    check("verifier 42자 → invalid_request (ticket 미소비)",
      short.status === 400 && shortBody.error === "invalid_request");
    const stillAlive = await form(undefined, "POST", `${API_PREFIX}/auth/sso/exchange`, exchangeFields(code, verifier));
    check("형식 오류는 ticket 을 태우지 않음 → 정상 재교환 성공", stillAlive.status === 200);
  }

  server.close();
  console.log(`\n결과: ${pass} PASS / ${fail} FAIL${happySub ? ` (sub=${happySub.slice(0, 8)}…)` : ""}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("test-sso harness crashed:", err);
  process.exit(1);
});
