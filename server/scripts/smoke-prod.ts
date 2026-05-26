// #6 — 한미르톡 운영 부팅 직후 스모크 검증 스크립트.
//
// 단일 명령으로 8개 단계를 차례대로 호출하고 PASS/FAIL 을 출력한다.
// 외부 의존성 없이 Node 18+ 내장 fetch 만 사용 — 운영 VM 에 npm install
// 만 끝나 있으면 바로 돌릴 수 있다.
//
// 사용:
//   # 1) 운영 VM 에서 (실제 비밀번호는 .env.prod 의 DEFAULT_PASSWORD 또는
//   #    변경 후 값):
//   npm run smoke:prod -- --base-url=http://<운영-VM-IP> \
//                         --email=<시드-관리자-이메일> \
//                         --password=<시드-비밀번호>
//
//   # 2) 환경변수로도 가능:
//   SMOKE_BASE_URL=http://<운영-VM-IP> \
//   SMOKE_EMAIL=<시드-관리자-이메일> \
//   SMOKE_PASSWORD=<시드-비밀번호> \
//     npm run smoke:prod
//
//   # 3) 상세 응답 보기:
//   npm run smoke:prod -- --verbose
//
// 종료 코드: 모든 단계 PASS → 0, 하나라도 FAIL → 1 (CI/cron 연결 용이).

interface Args {
  baseUrl: string;
  email: string;
  password: string;
  verbose: boolean;
}

function parseArgs(): Args {
  const env = process.env;
  let baseUrl = env.SMOKE_BASE_URL ?? "http://localhost:4000";
  let email = env.SMOKE_EMAIL ?? "";
  let password = env.SMOKE_PASSWORD ?? "";
  let verbose = false;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--base-url=")) baseUrl = arg.slice("--base-url=".length);
    else if (arg.startsWith("--email=")) email = arg.slice("--email=".length);
    else if (arg.startsWith("--password=")) password = arg.slice("--password=".length);
    else if (arg === "--verbose" || arg === "-v") verbose = true;
  }
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.error(
      "사용법: npm run smoke:prod -- --base-url=<url> --email=<email> --password=<pw>"
    );
    process.exit(2);
  }
  // base URL 끝 슬래시 제거.
  baseUrl = baseUrl.replace(/\/$/, "");
  return { baseUrl, email, password, verbose };
}

// Set-Cookie 헤더에서 (name=value) 페어만 추출해 jar 에 저장.
// Node 18.18 부터 headers.getSetCookie() 가 정식 노출되었으므로 우선 사용.
function extractCookies(res: Response): { name: string; value: string; raw: string }[] {
  const headers = res.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const raws =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : // 폴백: 단일 string (다중 cookie 시 RFC 위반이지만 운영 안전망).
        (headers.get("set-cookie")?.split(/,(?=\s*[A-Za-z0-9!#$%&'*+\-.^_`|~]+=)/) ?? []);
  const out: { name: string; value: string; raw: string }[] = [];
  for (const raw of raws) {
    const m = /^([^=;]+)=([^;]*)/.exec(raw);
    if (!m) continue;
    out.push({ name: m[1].trim(), value: m[2].trim(), raw });
  }
  return out;
}

type CookieJar = Map<string, string>;

async function request(
  baseUrl: string,
  jar: CookieJar,
  path: string,
  init: RequestInit = {}
): Promise<{ res: Response; ms: number; cookies: ReturnType<typeof extractCookies> }> {
  const headers = new Headers(init.headers);
  if (jar.size > 0) {
    const cookieHeader = [...jar.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    headers.set("cookie", cookieHeader);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const started = Date.now();
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const ms = Date.now() - started;
  const cookies = extractCookies(res);
  // 받은 cookie 를 jar 에 저장 (간단 — Max-Age=0 인 logout 쿠키는 값으로 빈
  // string 이 들어와 자연스럽게 무효화됨).
  for (const c of cookies) jar.set(c.name, c.value);
  return { res, ms, cookies };
}

// 결과 라벨링.
let totalPass = 0;
let totalFail = 0;
function pass(label: string, detail: string, ms: number): void {
  totalPass += 1;
  // eslint-disable-next-line no-console
  console.log(`  PASS  ${label.padEnd(36)} ${ms.toString().padStart(4)}ms  ${detail}`);
}
function fail(label: string, detail: string, ms: number): void {
  totalFail += 1;
  // eslint-disable-next-line no-console
  console.log(`  FAIL  ${label.padEnd(36)} ${ms.toString().padStart(4)}ms  ${detail}`);
}
function info(line: string): void {
  // eslint-disable-next-line no-console
  console.log(line);
}

async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

async function main() {
  const args = parseArgs();
  const { baseUrl, email, password, verbose } = args;
  const wantsSecureCookie = baseUrl.startsWith("https://");
  const jar: CookieJar = new Map();

  info("");
  info(`한미르톡 운영 스모크 — ${baseUrl}`);
  info(`시드 계정: ${email}`);
  info(`Secure 쿠키 기대값: ${wantsSecureCookie ? "있음(HTTPS)" : "없음(HTTP)"}`);
  info("");

  // 1. 공개 health — 인증 불필요.
  {
    const { res, ms } = await request(baseUrl, jar, "/api/v1/health");
    const body = (await readBody(res)) as { ok?: boolean } | undefined;
    if (res.status === 200 && body?.ok === true) {
      pass("1. GET /health", "ok=true", ms);
    } else {
      fail("1. GET /health", `status=${res.status} body=${JSON.stringify(body)}`, ms);
    }
  }

  // 2. login — Set-Cookie 발급 + Secure 플래그 검증.
  let accessTokenLength = 0;
  {
    const { res, ms, cookies } = await request(baseUrl, jar, "/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    const body = (await readBody(res)) as { token?: string; user?: { id?: string } } | undefined;
    const accessCookie = cookies.find((c) => c.name === "hanmir_token");
    const refreshCookie = cookies.find((c) => c.name === "hanmir_refresh");
    if (res.status !== 200) {
      fail("2. POST /auth/login", `status=${res.status} body=${JSON.stringify(body)}`, ms);
    } else if (!accessCookie || !refreshCookie) {
      fail(
        "2. POST /auth/login",
        `Set-Cookie 부족 (access=${!!accessCookie} refresh=${!!refreshCookie})`,
        ms
      );
    } else if (
      wantsSecureCookie &&
      (!/;\s*Secure/i.test(accessCookie.raw) || !/;\s*Secure/i.test(refreshCookie.raw))
    ) {
      fail(
        "2. POST /auth/login",
        "HTTPS 인데 쿠키에 Secure 플래그가 없음 — PUBLIC_ORIGIN https:// 인지 확인",
        ms
      );
    } else {
      accessTokenLength = body?.token?.length ?? 0;
      pass("2. POST /auth/login", `cookies set, token len=${accessTokenLength}`, ms);
    }
  }

  // 3. /auth/me — 쿠키 인증 동작.
  {
    const { res, ms } = await request(baseUrl, jar, "/api/v1/auth/me");
    const body = (await readBody(res)) as { id?: string; name?: string; role?: string } | undefined;
    if (res.status === 200 && body?.id) {
      pass("3. GET /auth/me", `${body.name} (${body.role})`, ms);
    } else {
      fail("3. GET /auth/me", `status=${res.status} body=${JSON.stringify(body)}`, ms);
    }
  }

  // 4. /system/health — 어댑터 / DB 연결.
  let adapter: string | undefined;
  {
    const { res, ms } = await request(baseUrl, jar, "/api/v1/system/health");
    const body = (await readBody(res)) as
      | {
          adapter?: string;
          database?: { ok?: boolean };
          uptimeSeconds?: number;
          socketClients?: number;
        }
      | undefined;
    adapter = body?.adapter;
    if (res.status === 200 && body?.database?.ok === true) {
      pass(
        "4. GET /system/health",
        `adapter=${adapter ?? "?"}, db=ok, uptime=${body?.uptimeSeconds ?? 0}s, sockets=${
          body?.socketClients ?? 0
        }`,
        ms
      );
    } else {
      fail(
        "4. GET /system/health",
        `status=${res.status} adapter=${adapter} db_ok=${body?.database?.ok}`,
        ms
      );
    }
  }

  // 5. /system/version — 빌드 정보.
  {
    const { res, ms } = await request(baseUrl, jar, "/api/v1/system/version");
    const body = (await readBody(res)) as
      | { version?: string; gitCommit?: string; env?: string; node?: string }
      | undefined;
    if (res.status === 200 && body?.version) {
      pass(
        "5. GET /system/version",
        `v${body.version} (${body.gitCommit ?? "?"}) ${body.env ?? ""} node=${body.node ?? "?"}`,
        ms
      );
    } else {
      fail("5. GET /system/version", `status=${res.status}`, ms);
    }
  }

  // 6. /notifications/unread-count — Phase 6 마이그(014) 적용 여부 간접 확인.
  {
    const { res, ms } = await request(baseUrl, jar, "/api/v1/notifications/unread-count");
    const body = (await readBody(res)) as { count?: number } | undefined;
    if (res.status === 200 && typeof body?.count === "number") {
      pass("6. GET /notifications/unread-count", `count=${body.count}`, ms);
    } else {
      fail(
        "6. GET /notifications/unread-count",
        `status=${res.status} body=${JSON.stringify(body)}`,
        ms
      );
    }
  }

  // 7. /search?q= — Phase 2/9 FTS+trgm 인덱스(011) 적용 여부 간접 확인.
  {
    const { res, ms } = await request(baseUrl, jar, "/api/v1/search?q=한미르");
    const body = (await readBody(res)) as
      | { messages?: unknown[]; files?: unknown[]; projects?: unknown[]; products?: unknown[] }
      | undefined;
    if (
      res.status === 200 &&
      body &&
      Array.isArray(body.messages) &&
      Array.isArray(body.files) &&
      Array.isArray(body.projects) &&
      Array.isArray(body.products)
    ) {
      pass(
        "7. GET /search?q=한미르",
        `messages=${body.messages.length} files=${body.files.length} projects=${body.projects.length} products=${body.products.length}`,
        ms
      );
    } else {
      fail("7. GET /search?q=한미르", `status=${res.status}`, ms);
    }
  }

  // 8. logout — Set-Cookie 무효화.
  {
    const { res, ms, cookies } = await request(baseUrl, jar, "/api/v1/auth/logout", {
      method: "POST"
    });
    const cleared = cookies.some((c) => c.name === "hanmir_token" && c.value === "");
    if (res.status === 200 && cleared) {
      pass("8. POST /auth/logout", "cookies cleared", ms);
    } else {
      fail(
        "8. POST /auth/logout",
        `status=${res.status} cleared=${cleared} (Set-Cookie 에 hanmir_token=; Max-Age=0 기대)`,
        ms
      );
    }
  }

  info("");
  info(`결과: ${totalPass} PASS / ${totalFail} FAIL`);
  if (verbose) info(`(adapter=${adapter ?? "unknown"})`);
  process.exit(totalFail === 0 ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("스모크 실행 중 예기치 못한 오류:", err);
  process.exit(3);
});
