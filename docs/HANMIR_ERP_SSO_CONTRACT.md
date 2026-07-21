# HanmirERP SSO 연동 계약 (HanmirTalk = 사내 통합 로그인 진입점)

작성: 2026-07-21 · 브랜치 `feature/hanmir-erp-sso-provider`
대상 독자: HanmirERP 개발 담당자, HanmirTalk 운영자

HanmirTalk 이 사내 통합 로그인(Identity Provider) 역할을 하고, HanmirERP 는
**1회용 authorization ticket** 을 서버 간 교환해 사용자 신원을 확인한 뒤
**ERP hostname 전용 세션 쿠키를 자체 발급**한다.

> HanmirCost 는 별도 세션 체계를 사용하며 이 계약의 적용 대상이 아니다.

---

## 1. 불변 원칙

1. **쿠키 비공유.** HanmirTalk 의 `hanmir_token`(access) / `hanmir_refresh`(refresh)
   쿠키는 `Domain` 속성 없이 발급되는 host-only 쿠키다. 어떤 경우에도
   `.hanmirworks.space` 전체로 스코프를 넓히지 않는다. ERP 는 이 쿠키를
   읽지도, 삭제하지도, 재전송받지도 않는다.
2. **ERP 세션은 ERP 소유.** 교환 성공 후 ERP 가 자기 hostname 에만 유효한
   `HttpOnly; Secure; SameSite=Lax` 세션 쿠키를 발급한다. 세션 수명·연장·
   무효화 정책은 전적으로 ERP 책임이다.
3. **identity 만 전달, 권한은 비전달.** HanmirTalk 은 "이 사람이 누구인가"만
   증명한다. Talk 의 role(member/manager/project_owner/admin/super_admin)은
   응답에 **포함되지 않으며**, ERP 관리자 권한으로 승격하는 매핑을 만들지
   않는다. ERP 권한은 ERP 가 `sub`(사용자 UUID) 기준으로 자체 관리한다.
4. **ticket 은 1회용·초단명.** 기본 TTL 60초, 한 번 교환되면 즉시 폐기.
   DB 에는 ticket 원문이 아닌 SHA-256 해시만 저장된다.
5. **redirect 는 사전 등록 정확 일치만.** 부분 문자열·접두사·와일드카드·
   포트 변형 전부 거부. 미등록 URI 로는 어떤 리다이렉트도 발생하지 않는다
   (open redirect 원천 차단).

---

## 2. 시퀀스

```
브라우저                    HanmirERP 서버                HanmirTalk 서버
   │  ① GET erp.…/어느페이지     │                             │
   ├───────────────────────────▶│ ERP 세션 없음                │
   │  ② 302 → Talk authorize    │  (state·code_verifier 생성,  │
   │◀───────────────────────────┤   state 는 ERP 측에 보관)    │
   │  ③ GET /api/v1/auth/sso/authorize?client_id=…&redirect_uri=…│
   │      &state=…&code_challenge=…&code_challenge_method=S256  │
   ├────────────────────────────────────────────────────────────▶│
   │                             │        Talk 세션 확인:       │
   │                             │  access 유효 → 통과          │
   │                             │  access 만료+refresh 유효    │
   │                             │    → 기존 회전 로직으로 복구 │
   │                             │  둘 다 없음 → /login?next=…  │
   │                             │    (로그인 후 ③ 으로 복귀)   │
   │  ④ 302 → redirect_uri?code=<ticket>&state=<그대로 반환>    │
   │◀────────────────────────────────────────────────────────────┤
   │  ⑤ GET erp.…/auth/sso/callback?code=…&state=…              │
   ├───────────────────────────▶│ state 가 ①에서 만든 값과     │
   │                             │ 일치하는지 비교(불일치=중단) │
   │                             │  ⑥ POST /api/v1/auth/sso/exchange (server-to-server)
   │                             ├────────────────────────────▶│
   │                             │   client_secret + code +     │ ticket 원자 소비
   │                             │   code_verifier 검증         │ (동시 요청 1건만 성공)
   │                             │  ⑦ 200 identity JSON         │ 사용자 활성 재검증
   │                             │◀────────────────────────────┤
   │  ⑧ Set-Cookie: ERP 자체 세션(HttpOnly/Secure/Lax, ERP host 전용)
   │◀───────────────────────────┤                             │
```

---

## 3. 엔드포인트

베이스: `https://hanmirworks.space/api/v1` (운영 · Cloudflare Tunnel → caddy → server)

### 3.1 `GET /auth/sso/authorize` — 브라우저 리다이렉트 진입

| query 파라미터 | 필수 | 형식 | 설명 |
|---|---|---|---|
| `client_id` | ✔ | `[a-z0-9._-]{2,64}` | 등록된 클라이언트 ID (예: `hanmir-erp`) |
| `redirect_uri` | ✔ | 절대 URL | **등록값과 문자열 정확 일치** |
| `state` | ✔ | 출력 가능한 ASCII 8~512자 | ERP 가 생성한 CSRF 바인딩 난수. 그대로 반환됨 |
| `code_challenge` | ✔ | base64url 43~128자 | PKCE S256 챌린지 = BASE64URL(SHA256(code_verifier)) |
| `code_challenge_method` | ✔ | `S256` 고정 | `plain` 불허 |

응답:

- **성공** → `302 redirect_uri?code=<ticket>&state=<원본 state>`
- 미로그인 → `302 /login?next=<이 authorize 경로>` (로그인 후 자동 복귀).
  access 만료 + refresh 유효면 리다이렉트 없이 기존 refresh 회전 로직으로
  조용히 복구된다 (`/auth/refresh`·`/auth/bounce` 와 동일 코드 경로).
- `client_id` 미등록 → `400 {"error":"invalid_client"}` — **리다이렉트 없음**
- `redirect_uri` 미등록 → `400 {"error":"invalid_redirect_uri"}` — **리다이렉트 없음**
- `state`/`code_challenge` 불량 → `302 redirect_uri?error=invalid_request&state=…`
- 비활성 사용자 → `302 redirect_uri?error=access_denied&state=…`
- 레이트리밋 → `429 {"error":"too_many_requests"}` (IP 당 30회/분)
- SSO 미설정(SSO_CLIENTS 비어 있음) → `503 {"error":"sso_not_configured"}`

### 3.2 `POST /auth/sso/exchange` — ERP 서버 → Talk 서버 (server-to-server)

Content-Type: `application/x-www-form-urlencoded` 또는 `application/json`.
브라우저에서 호출 금지 — `client_secret` 이 실리는 요청이다.

| body 파라미터 | 필수 | 설명 |
|---|---|---|
| `grant_type` | ✔ | `authorization_code` 고정 |
| `client_id` | ✔ | 등록 클라이언트 ID |
| `client_secret` | ✔ | 발급받은 secret 원문 (Talk 은 SHA-256 해시로만 검증) |
| `code` | ✔ | ④에서 받은 1회용 ticket (`ticket` 이라는 이름도 허용) |
| `redirect_uri` | ✔ | ③에서 사용한 값과 정확 일치 |
| `code_verifier` | ✔ | PKCE 원문 (base64url 43~128자) |

**성공 `200`:**

```json
{
  "ok": true,
  "sub": "b0e4…-…",                // HanmirTalk 사용자 UUID — 불변 키. ERP 는 이 값으로 계정 매핑
  "email": "hong@hanmirfe.com",    // 변경될 수 있음 — 표시·통지용 (매핑 키로 쓰지 말 것)
  "name": "홍길동",
  "departmentId": "d3f2…",
  "departmentName": "생산기술팀",
  "isActive": true,
  "issuedAt": "2026-07-21T02:00:00.000Z",
  "expiresAt": "2026-07-21T02:01:00.000Z"  // 이 assertion 의 신뢰 한도 — 토큰이 아님
}
```

응답은 **토큰이 아니라 1회성 identity assertion** 이다. ERP 는 수신 즉시
자체 세션을 만들고 응답 자체를 저장·재사용하지 않는다.

**오류:**

| HTTP | `error` | 원인 |
|---|---|---|
| 400 | `unsupported_grant_type` | `grant_type` ≠ `authorization_code` |
| 401 | `invalid_client` | client_id 미등록 또는 secret 불일치 (ticket 은 소비되지 않음) |
| 400 | `invalid_request` | code/redirect_uri/code_verifier 누락·형식 오류 |
| 400 | `invalid_grant` | ticket 불명·만료·재사용, client/redirect 바인딩 불일치, PKCE 불일치, 사용자 비활성 — 구분 불가(의도적 단일화) |
| 429 | `too_many_requests` | IP 당 30회/분 초과 |
| 503 | `sso_not_configured` | SSO_CLIENTS 미설정 |

검증 순서(보안상 고정): client 인증 → ticket 원자 소비 → 바인딩(client_id·
redirect_uri) → PKCE → 사용자 활성. secret 이 틀린 요청은 ticket 을 태우지
못하며, 바인딩/PKCE 불일치는 이미 소비된 ticket 을 그대로 폐기시킨다
(재시도 불가 — 정상 클라이언트라면 발생하지 않는 상황).

---

## 4. Ticket 수명주기와 재사용 방지

- 생성: `crypto.randomBytes(32)` → base64url 43자. **DB(`sso_authorization_tickets`,
  마이그레이션 036)에는 SHA-256 hex 해시만 저장** (refresh token 과 동일 정책).
- 저장 필드: `ticket_hash(UNIQUE)`, `user_id`, `client_id`, `redirect_uri`,
  `state_hash`(state 의 sha256 — 원문 비저장), `code_challenge`, `expires_at`,
  `consumed_at`, `created_at`.
- TTL: `SSO_TICKET_TTL_SEC` (기본 60초, 서버가 10~300초로 clamp).
- 소비: 단일 조건부 UPDATE
  `SET consumed_at=NOW() WHERE ticket_hash=$1 AND consumed_at IS NULL AND expires_at > NOW() RETURNING …`
  — PostgreSQL 행 잠금이 동시 교환을 직렬화해 **동시에 두 번 교환해도
  정확히 한 요청만 성공**한다. 나머지는 `invalid_grant`.
- 만료 1일 경과 행은 발급 시점에 기회적으로 삭제(포렌식용 짧은 보존).
- 감사 로그(`audit_logs`): `auth.sso.authorize`, `auth.sso.exchange`
  (+ `.denied` 변형)에 **사용자 ID·clientId·성공 여부·거부 사유 코드만**
  기록한다. ticket/code/secret/state 원문·쿠키·Authorization 헤더는 감사
  로그와 애플리케이션 로그 어디에도 남지 않는다.

---

## 5. ERP 클라이언트 등록 방법 (HanmirTalk 운영자)

1. VM 에서 실행 (터미널 출력만, 로그 금지):
   ```
   npx tsx server/scripts/generate-sso-client.ts hanmir-erp https://<ERP-호스트>/auth/sso/callback
   ```
   ※ 호스트에 Node 가 없으므로 실제로는 일회용 컨테이너로:
   `docker run --rm -u $(id -u):$(id -g) -v /srv/hanmir-talk:/app -w /app -e HOME=/tmp node:20-alpine npx tsx server/scripts/generate-sso-client.ts …`
2. 출력의 **secret 원문 → ERP 서버 환경/vault 로 전달** (안전 채널로).
   Talk 쪽엔 어디에도 저장하지 않는다.
3. 출력의 **JSON 조각 → `.env.prod` 의 `SSO_CLIENTS`** 에 넣는다
   (`.env.prod` 는 gitignore + chmod 600).
4. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`
   로 server 컨테이너 재기동 시 반영.

`redirectUris` 배열에는 콜백 URL 을 **완전한 형태 그대로** 등록한다.
스킴·호스트·포트·경로·쿼리까지 문자열 정확 일치로 비교하므로, 콜백 URL 이
바뀌면 등록값도 함께 바꿔야 한다.

---

## 6. 환경변수 (이름만 — 값은 각 시스템의 비밀 저장소에)

**HanmirTalk (.env.prod / docker-compose.prod.yml server 서비스):**

| 이름 | 용도 |
|---|---|
| `SSO_CLIENTS` | 등록 클라이언트 JSON 배열 (secret 은 sha256 해시만) |
| `SSO_TICKET_TTL_SEC` | ticket TTL 초 (기본 60) |

**HanmirERP (권장 이름 — ERP 저장소 기준):**

| 이름 | 용도 |
|---|---|
| `ERP_SSO_CLIENT_ID` | 예: `hanmir-erp` |
| `ERP_SSO_CLIENT_SECRET` | 발급받은 secret 원문 (vault/gitignore env 전용) |
| `ERP_SSO_AUTHORIZE_URL` | `https://hanmirworks.space/api/v1/auth/sso/authorize` |
| `ERP_SSO_EXCHANGE_URL` | `https://hanmirworks.space/api/v1/auth/sso/exchange` |
| `ERP_SSO_REDIRECT_URI` | `https://<ERP-호스트>/auth/sso/callback` (등록값과 동일) |

---

## 7. ERP 측 구현 체크리스트 (남은 작업)

1. **로그인 필요 감지** — ERP 세션 쿠키 없으면 `state`(crypto random ≥16B)와
   `code_verifier`(base64url 43~128자) 생성, 둘 다 **서버측 임시 저장**(또는
   ERP hostname 전용 단명 HttpOnly 쿠키)에 보관 후 authorize 로 302.
2. **콜백** — `state` 가 보관값과 정확 일치하는지 비교(불일치 즉시 중단),
   `error` 파라미터 처리(`access_denied` 등), `code` 를 exchange 로 전달.
3. **exchange 호출** — 서버에서만. TLS 필수. 응답의 `sub` 로 ERP 사용자
   레코드 upsert(최초 방문 시 생성 정책은 ERP 결정), `email`/`name` 은
   표시용 갱신.
4. **세션 발급** — ERP hostname 전용 `HttpOnly; Secure; SameSite=Lax` 쿠키.
   `Domain` 속성을 붙이지 말 것(host-only 유지 — `.hanmirworks.space` 로
   넓히면 이 계약 위반).
5. **권한** — `sub` 기준 ERP 자체 권한 테이블. Talk role 을 묻지도, 받지도
   않는다.
6. **로그아웃** — ERP 세션 쿠키만 만료시킨다. Talk 쿠키를 건드리지 않는다.
   Talk 전체 로그아웃(single logout)은 별도 후속 과제.
7. **재시도 금지** — exchange 가 `invalid_grant` 면 ticket 은 죽은 것.
   authorize 부터 다시 시작한다 (사용자에겐 투명 — Talk 세션이 살아 있으면
   리다이렉트 2번으로 끝난다).
8. `code`/`client_secret` 을 로그·APM·오류 리포트에 남기지 않는다.

## 8. Secret rotation / 폐기

- **rotation:** ① `generate-sso-client.ts` 재실행 → 새 secret/해시 획득
  ② Talk `SSO_CLIENTS` 항목에 `"previousSecretSha256": "<기존 해시>"` 를
  추가하고 `secretSha256` 을 새 해시로 교체 → 재배포 (두 secret 병행 인정)
  ③ ERP 의 `ERP_SSO_CLIENT_SECRET` 을 새 원문으로 교체 → 재배포
  ④ `previousSecretSha256` 필드 제거 → 재배포 (기존 secret 즉시 무효).
- **긴급 폐기:** `SSO_CLIENTS` 에서 해당 항목을 제거하거나 `secretSha256`
  을 교체하고 재배포하면 그 즉시 신규 authorize/exchange 가 전부 거부된다.
  이미 발급된 ERP 세션은 ERP 쪽에서 무효화해야 한다.
- 유출 의심 시 감사 로그에서 `auth.sso.exchange.denied`(reason
  `client_auth_failed`) 급증 여부를 확인한다.

## 9. Cloudflare / 배포 메모 (이번 작업 범위 밖 — 별도 승인 후)

- HanmirTalk 쪽 신규 hostname 불필요 — authorize/exchange 는 기존
  `hanmirworks.space/api/*` 경로로 caddy 가 이미 라우팅한다.
  (이번 작업에서 Cloudflare/Caddy/DNS 는 변경하지 않았다.)
- HanmirERP 용 hostname 1개 필요: 예 `erp.hanmirworks.space`
  (Cloudflare Tunnel public hostname 추가 → ERP 웹/서버로 연결).
  이 값이 정해져야 `redirectUris` 등록이 가능하다.
- ERP 서버가 같은 VM 에 있으면 exchange 는 공인 URL 대신 내부 경로
  (`http://127.0.0.1:80/api/v1/auth/sso/exchange`, Host 헤더 유지)로도
  가능 — 왕복 지연·외부 의존을 줄인다. 어느 쪽이든 계약은 동일.
- **HanmirTalk 배포 전 필수:** 운영 DB 에 마이그레이션 036 선적용
  (기존 절차: `docker compose -f docker-compose.prod.yml exec -T postgres
  psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1
  -f /docker-entrypoint-initdb.d/036_sso_authorization_tickets.sql`).
  미적용 상태에서 authorize 호출 시 500 (테이블 없음). SSO_CLIENTS 를
  설정하지 않으면 503 으로 안전 비활성 — 기존 기능 영향 없음.

## 10. 사용자 identity 매핑 원칙 요약

| 항목 | 원칙 |
|---|---|
| 매핑 키 | `sub` (Talk 사용자 UUID) — 불변, 이메일 변경에도 유지 |
| email/name/부서 | 표시·동기화용. 매 로그인 시 갱신 권장 |
| 비활성 사용자 | authorize·exchange 양쪽에서 재검증 — ERP 신규 세션 불가. 기존 ERP 세션 처리(즉시 차단 여부)는 ERP 정책 |
| 최초 방문자 | ERP 가 `sub` 기준 자동 생성할지, 사전 등록제일지 ERP 결정 |
| 권한 | Talk role 비전달. ERP 자체 관리 (기본값은 최소 권한 권장) |
