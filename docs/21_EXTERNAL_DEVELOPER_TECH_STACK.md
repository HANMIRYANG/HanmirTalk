# 외부 연동 개발자용 기술 스택 및 인터페이스 목록

작성일: 2026-05-28  
프로젝트명: Hanmir Talk  
용도: 외부 프로그램과 Hanmir Talk를 연동하기 위해 외부 개발자에게 전달할 기술 스택, API, 인증, 배포 구성을 정리한 문서입니다.

> 외부 제공 전 주의: 이 문서는 실제 비밀번호, API Key, 운영 DB 접속 정보, 내부 서버 IP를 포함하지 않습니다. 운영 URL, 테스트 계정, 허용 IP 등은 전달 직전에 별도로 채워야 합니다.

## 1. 프로젝트 개요

Hanmir Talk는 사내 메신저, 프로젝트 관리, 업무 관리, 제품 정보, 파일, 공지, 결정사항, 알림을 한 업무 허브에서 처리하는 웹 애플리케이션입니다.

주요 기능:

- 사용자/부서/권한 관리
- 채팅방, 메시지, 답글, 반응, 예약 전송
- 프로젝트, 프로젝트 멤버, 업무, 간트/진행 관리
- 제품 정보, 제품 규격, LOT, 문서, 판매 가능 상태 관리
- 파일 업로드/다운로드
- 공지 및 확인 현황
- 결정사항 기록 및 확인 현황
- 통합 검색
- 인앱 알림, Web Push, Socket.IO 실시간 이벤트
- Anthropic Claude 기반 AI 명령 기능

## 2. 저장소 구조

```text
hanmir-talk/
├─ apps/web/              # Next.js 프론트엔드
├─ server/                # Express API 서버 + Socket.IO
├─ packages/shared/       # 프론트/서버 공용 TypeScript 타입
├─ docs/                  # 제품/기술 문서
├─ ops/backup/            # 백업/복구 운영 문서
├─ docker-compose.yml     # 로컬 개발용 Postgres + Mailhog
├─ docker-compose.prod.yml# 운영용 web/server/postgres/caddy 구성
├─ Caddyfile              # 운영 reverse proxy 설정
└─ package.json           # npm workspaces 루트
```

워크스페이스:

- `apps/web`: `@hanmir/web`
- `server`: `@hanmir/server`
- `packages/shared`: `@hanmir/shared`

## 3. 기술 스택

| 영역 | 사용 기술 | 버전/비고 |
| --- | --- | --- |
| 런타임 | Node.js | `>=18.18.0`, Docker 운영 이미지는 `node:20-alpine` |
| 패키지 매니저 | npm workspaces | 루트 `package-lock.json` 사용 |
| 언어 | TypeScript | `5.4.5` |
| 프론트엔드 | Next.js | `14.2.5`, App Router |
| UI 런타임 | React / React DOM | `18.3.1` |
| 스타일 | CSS Modules, Tailwind CSS | Tailwind `3.4.4`, PostCSS |
| 백엔드 | Express | `4.19.2` |
| 실시간 통신 | Socket.IO | 서버/클라이언트 `^4.8.1` |
| DB | PostgreSQL | 운영/로컬 Docker: `postgres:16-alpine` |
| DB 드라이버 | `pg` | `8.11.5` |
| 인증/비밀번호 | httpOnly Cookie 세션, bcryptjs | `bcryptjs ^2.4.3` |
| 파일 업로드 | multer | `^2.0.1`, 기본 50MB 제한 |
| 메일 | nodemailer | `^6.9.16`, 로컬 Mailhog |
| Push | Web Push / VAPID | `web-push ^3.6.7` |
| AI | Anthropic SDK | `@anthropic-ai/sdk ^0.96.0` |
| 운영 Reverse Proxy | Caddy | `caddy:2-alpine` |
| 개발 메일 서버 | Mailhog | `mailhog/mailhog:v1.0.1` |

## 4. 실행 및 배포 구성

### 로컬 개발

```bash
npm install
npm run db:up
npm run dev
```

기본 포트:

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api/v1`
- Socket.IO: `http://localhost:4000/socket.io`
- PostgreSQL: `localhost:5432`
- Mailhog UI: `http://localhost:8025`

### 운영 Docker 구성

운영은 `docker-compose.prod.yml` 기준으로 다음 컨테이너를 사용합니다.

- `caddy`: 80/443 reverse proxy
- `web`: Next.js standalone server, 내부 포트 `3000`
- `server`: Express API + Socket.IO, 내부 포트 `4000`
- `postgres`: PostgreSQL 16

Caddy 라우팅:

- `/api/*` -> `server:4000`
- `/socket.io/*` -> `server:4000`
- 나머지 웹 요청 -> `web:3000`

## 5. 주요 환경 변수

외부 개발자에게 실제 값을 직접 전달하지 말고, 필요한 값만 별도 보안 채널로 전달하세요.

| 변수 | 용도 |
| --- | --- |
| `PUBLIC_ORIGIN` | 운영 접속 URL. 예: `https://talk.example.com` |
| `PORT` | API 서버 포트. 기본 `4000` |
| `API_PREFIX` | REST API prefix. 기본 `/api/v1` |
| `CORS_ORIGIN` | API 요청을 허용할 웹 Origin 목록 |
| `NEXT_PUBLIC_API_BASE_URL` | 브라우저에서 호출할 API Base URL |
| `API_BASE_URL` | Next.js SSR 내부 API Base URL |
| `DATABASE_URL` | 서버가 PostgreSQL에 접속할 connection string |
| `POSTGRES_USER` | 운영 Docker PostgreSQL 사용자 |
| `POSTGRES_PASSWORD` | 운영 Docker PostgreSQL 비밀번호 |
| `POSTGRES_DB` | 운영 Docker PostgreSQL DB명 |
| `UPLOAD_DIR` | API 서버 컨테이너 내부 업로드 경로 |
| `UPLOAD_DIR_HOST` | 운영 호스트의 업로드 bind mount 경로 |
| `UPLOAD_MAX_BYTES` | 파일 업로드 제한. 기본 `52428800` |
| `DEFAULT_PASSWORD` | 초기 계정 비밀번호. 운영 공유 금지 |
| `SMTP_ENABLED` | SMTP 발송 사용 여부 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM` | 메일 발송 설정 |
| `ANTHROPIC_API_KEY` | AI 명령용 Anthropic API Key |
| `ANTHROPIC_MODEL` | AI 명령 모델. 기본 `claude-sonnet-4-6` |
| `AI_DAILY_TOKEN_LIMIT` | 사용자별 일일 AI 출력 토큰 제한. `0`은 제한 없음 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push 설정 |

## 6. 인증 방식

현재 인증은 브라우저 사용자를 중심으로 설계되어 있습니다.

- 로그인: `POST /api/v1/auth/login`
- 로그인 성공 시:
  - `hanmir_token` httpOnly access cookie 발급
  - `hanmir_refresh` httpOnly refresh cookie 발급
  - 응답 body에도 전환기 호환용 `token` 포함
- Access token TTL: 1시간
- Refresh token TTL: 30일
- Refresh token rotation 사용
- Cookie 속성:
  - `HttpOnly`
  - `SameSite=Strict`
  - `Secure`는 `CORS_ORIGIN`에 `https://`가 포함될 때 적용
- 서버/스크립트형 클라이언트는 `Authorization: Bearer <token>` 방식도 지원합니다.

중요:

- 현재 전용 장기 API Key, OAuth client credential, webhook secret 체계는 없습니다.
- 외부 서버가 백그라운드로 장시간 연동해야 한다면 서비스 계정/API Key 방식 추가 개발을 권장합니다.
- 외부 프로그램이 브라우저가 아닌 서버라면 CORS보다 인증/토큰 수명/허용 IP 정책을 먼저 확정해야 합니다.

로그인 예시:

```bash
curl -X POST "https://<운영도메인>/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"<계정 이메일>","password":"<비밀번호>"}'
```

인증 API 호출 예시:

```bash
curl "https://<운영도메인>/api/v1/projects" \
  -H "Authorization: Bearer <login-response-token>"
```

## 7. REST API Base

기본 Base URL:

```text
/api/v1
```

운영 예시:

```text
https://<운영도메인>/api/v1
```

응답 형식:

- 기본 JSON
- 성공: 리소스 JSON 또는 `{ "ok": true }`
- 인증 실패: `401 { "error": "unauthorized" }`
- 권한 실패: `403 { "error": "forbidden" }`
- 미존재: `404 { "error": "not_found" }`
- 서버 오류: `500 { "error": "internal_error" }`

## 8. API 목록

아래 목록은 현재 서버 라우트 기준 요약입니다. 상세 DTO는 `packages/shared/src/types.ts`를 기준으로 확인합니다.

### Auth

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/change-password`
- `GET /auth/invitation/:token`
- `POST /auth/accept-invite`

### Users

- `GET /users`
- `GET /users/:id`
- `POST /users`
- `PATCH /users/:id`
- `PATCH /users/:id/deactivate`

### Departments

- `GET /departments`
- `POST /departments`
- `PATCH /departments/:id`
- `DELETE /departments/:id`

### Rooms / Chat

- `GET /rooms`
- `GET /rooms/:id`
- `POST /rooms`
- `POST /rooms/direct`
- `PATCH /rooms/:id`
- `POST /rooms/:roomId/members`
- `DELETE /rooms/:roomId/members/:userId`
- `POST /rooms/:roomId/mute`
- `DELETE /rooms/:roomId/mute`
- `POST /rooms/:roomId/leave`
- `GET /rooms/:roomId/messages`
- `POST /rooms/:roomId/messages`
- `GET /rooms/:roomId/pinned`
- `POST /rooms/:roomId/read`
- `POST /rooms/:roomId/pin`
- `DELETE /rooms/:roomId/pin`

### Messages

- `GET /messages/search?q=&roomId=&limit=`
- `GET /messages/:id/replies`
- `POST /messages/:id/replies`
- `PUT /messages/:id/reactions/:emoji`
- `DELETE /messages/:id/reactions/:emoji`
- `PATCH /messages/:id`
- `DELETE /messages/:id`
- `POST /messages/schedule`
- `GET /messages/scheduled`
- `DELETE /messages/scheduled/:id`
- `POST /messages/:messageId/create-decision`

### Mentions / Search

- `GET /mentions/search?q=`
- `GET /search?q=&scope=`

### Projects

- `GET /projects`
- `GET /projects/:id`
- `POST /projects`
- `PATCH /projects/:id`
- `DELETE /projects/:id`
- `POST /projects/:id/members`
- `DELETE /projects/:id/members/:userId`
- `GET /projects/:projectId/tasks`
- `POST /projects/:projectId/tasks`
- `GET /projects/:projectId/decisions`
- `POST /projects/:projectId/decisions`

### Tasks

- `GET /tasks/:id`
- `PATCH /tasks/:id`
- `DELETE /tasks/:id`

### Decisions

- `GET /decisions/:id`
- `PATCH /decisions/:id`
- `DELETE /decisions/:id`
- `POST /decisions/:id/confirm`
- `GET /decisions/:id/read-status`

### Products

- `GET /products`
- `GET /products/:id`
- `POST /products`
- `PATCH /products/:id`
- `DELETE /products/:id`
- `GET /products/:id/specs`
- `POST /products/:id/specs`
- `PATCH /products/:id/specs/:specId`
- `DELETE /products/:id/specs/:specId`
- `GET /products/:id/lots`
- `POST /products/:id/lots`
- `PATCH /products/:id/lots/:lotId`
- `DELETE /products/:id/lots/:lotId`
- `GET /products/:id/sales-history`
- `GET /products/:id/documents`
- `POST /products/:id/documents`
- `DELETE /products/:id/documents/:docId`

### Files

- `GET /files`
- `GET /files/folders`
- `POST /files/upload`
- `GET /files/:id`
- `GET /files/:id/download`
- `DELETE /files/:id`

파일 업로드:

- multipart field name: `file`
- 선택 scope: `projectId`, `productId`, `taskId`, `messageId`
- 기본 최대 크기: 50MB
- 허용 확장자: `jpg`, `jpeg`, `png`, `webp`, `gif`, `pdf`, `doc`, `docx`, `hwp`, `hwpx`, `xls`, `xlsx`, `csv`, `ppt`, `pptx`, `zip`
- 차단 확장자 예: `exe`, `bat`, `cmd`, `ps1`, `js`, `sh`, `html`, `svg`

### Notices

- `GET /notices`
- `POST /notices`
- `GET /notices/:id`
- `GET /notices/:id/read-status`
- `POST /notices/:id/confirm`

### Dashboard / Admin / System

- `GET /dashboard/overview`
- `GET /dashboard/admin-kpis`
- `GET /dashboard/audit`
- `GET /dashboard/dept-stats`
- `GET /dashboard/activities`
- `GET /dashboard/project-activities`
- `GET /audit`
- `GET /invitations`
- `POST /invitations`
- `DELETE /invitations/:id`
- `GET /system/health`
- `GET /system/version`
- `GET /system/security-policy`
- `GET /org-notification-defaults`
- `PATCH /org-notification-defaults/:category`

### Notifications / Push

- `GET /notifications`
- `GET /notifications/unread-count`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`
- `GET /notification-settings`
- `PATCH /notification-settings`
- `GET /push-subscriptions/vapid-public-key`
- `POST /push-subscriptions`
- `DELETE /push-subscriptions`

### AI

- `POST /ai/chat-summary`
- `POST /ai/extract-tasks`
- `POST /ai/extract-decisions`
- `POST /ai/draft-notice`
- `POST /ai/minutes`

AI API 공통 입력:

```json
{
  "roomId": "room-id",
  "scope": "recent20"
}
```

지원 scope:

- `recent20`
- `today`
- `thread`
- `messageIds`

AI 비활성 상태에서는 `503 { "error": "ai_disabled" }`를 반환합니다.

## 9. MES 생산 LOT 연동 요청 범위

이번 외부 연동 요청의 범위는 MES 전체 기능 연동이 아닙니다. MES에서 생산 LOT 데이터를 제공받아 Hanmir Talk의 기존 제품별 `생산 LOT` 탭에 자동 반영하는 것이 목적입니다.

현재 Hanmir Talk의 제품별 LOT 영역은 다음 API와 데이터 모델을 사용합니다.

- 조회: `GET /api/v1/products/:productId/lots`
- 등록: `POST /api/v1/products/:productId/lots`
- 수정: `PATCH /api/v1/products/:productId/lots/:lotId`
- 삭제: `DELETE /api/v1/products/:productId/lots/:lotId`
- 중복 기준: 현재 DB 기준으로 `product_id + lot_no` 조합이 유일해야 합니다.

현재 LOT 등록 화면에서 실제로 사용하는 필드는 아래 6개입니다.

| 화면 항목 | API 필드 | 필수 여부 | 비고 |
| --- | --- | --- | --- |
| LOT 번호 | `number` | 필수 | 제품 내에서 유일해야 합니다. |
| 생산일 | `producedAt` | 선택 | 권장 형식: `YYYY-MM-DD` |
| 수량 | `quantity` | 선택 | 현재 문자열로 저장합니다. 예: `1200`, `1200 kg` |
| 판정 | `verdict` | 선택 | 드롭다운 값: `pass`=합격, `hold`=보류, `retest`=재시험 |
| 시험일 | `testedAt` | 선택 | 권장 형식: `YYYY-MM-DD` |
| 비고 | `note` | 선택 | MES 비고, 공정 메모, 품질 메모 등을 저장할 수 있습니다. |

MES 업체 또는 외부 개발자에게 확인할 항목은 아래로 제한합니다.

1. MES에서 생산 LOT 데이터를 API로 제공 가능한지
2. API 제공이 어렵다면 CSV, Excel, DB View, 정기 파일 Export 방식으로 제공 가능한지
3. Hanmir Talk 제품과 MES 제품을 매칭할 수 있는 기준
   - 제품코드
   - 제품명
   - MES 제품 ID
   - 별도 매핑 테이블 필요 여부
4. 생산 LOT 데이터 필드 제공 가능 여부
   - LOT 번호
   - 생산일
   - 수량
   - 단위가 있다면 수량에 포함할지 별도 필드로 줄지
   - 판정 값 또는 품질 상태 값
   - 시험일
   - 비고
5. MES 판정 값을 Hanmir Talk 판정 값으로 매핑하는 기준
   - 합격 -> `pass`
   - 보류 -> `hold`
   - 재시험 -> `retest`
   - 그 외 MES 상태값이 있으면 매핑표 필요
6. LOT 데이터 변경 전달 범위
   - 신규 LOT만 전달하는지
   - 수량, 판정, 시험일, 비고 수정도 전달하는지
   - 취소/삭제/무효 LOT가 발생하는지
7. 중복 LOT 판단 기준
   - 기본 권장: 제품코드 또는 제품 ID + LOT 번호
   - MES 고유 LOT ID가 있다면 함께 제공 가능 여부
8. 연동 방식
   - 권장 초기안: Hanmir Talk가 MES API 또는 Export 파일을 주기적으로 가져오는 방식
   - 대안: MES가 Hanmir Talk API로 LOT 데이터를 보내주는 방식
9. 테스트용 샘플 데이터 제공 가능 여부
   - 최소 5~10건
   - 신규, 수정, 보류, 재시험 케이스 포함 권장

현재 Hanmir Talk에는 사용자 화면용 단건 LOT 등록/수정 API는 있지만, MES 전용 대량 upsert API나 장기 API Key 인증은 아직 없습니다. MES가 Hanmir Talk로 직접 push하는 구조를 선택한다면 서비스 계정, API Key, bulk upsert endpoint, 중복 처리 정책을 추가 개발 범위로 확정해야 합니다.

## 10. Socket.IO 연동

Socket.IO 접속 URL:

```text
https://<운영도메인>
```

주의:

- Socket.IO는 `/api/v1` prefix를 사용하지 않습니다.
- 실제 transport 경로는 `/socket.io/*`입니다.
- 브라우저 클라이언트는 `withCredentials: true`로 httpOnly cookie를 함께 보냅니다.
- 비브라우저 클라이언트는 handshake auth token 또는 `Authorization: Bearer <token>` 방식도 지원합니다.

클라이언트가 보낼 수 있는 주요 이벤트:

- `room:join`
- `room:leave`
- `project:join`
- `project:leave`

서버가 보내는 주요 이벤트:

- `message:new`
- `message:updated`
- `message:deleted`
- `message:reply:new`
- `message:reply:updated`
- `message:reply:deleted`
- `message:thread:updated`
- `message:reaction:updated`
- `room:pin`
- `room:created`
- `room:updated`
- `room:membership`
- `notice:new`
- `decision:new`
- `decision:updated`
- `decision:deleted`
- `notification:new`

접근 제어:

- 채팅방 이벤트 구독은 방 멤버 또는 관리자만 허용됩니다.
- 프로젝트 이벤트 구독은 프로젝트 멤버 또는 관리자만 허용됩니다.
- 허용되지 않은 join 요청은 조용히 무시됩니다.

## 11. 데이터 저장소

PostgreSQL을 기본 영속 저장소로 사용합니다. `DATABASE_URL`이 없으면 개발 편의를 위해 in-memory repository로 동작합니다.

주요 테이블:

- `departments`
- `users`
- `refresh_tokens`
- `rooms`
- `room_members`
- `messages`
- `message_reactions`
- `scheduled_messages`
- `attachments`
- `notices`
- `notice_reads`
- `projects`
- `project_members`
- `tasks`
- `decisions`
- `decision_reads`
- `products`
- `product_specs`
- `product_lots`
- `product_documents`
- `sales_status_events`
- `user_notifications`
- `user_notification_settings`
- `org_notification_defaults`
- `audit_logs`
- `user_invitations`
- `push_subscriptions`

DB 스키마 기준 파일:

- `server/src/db/schema.sql`
- `server/src/db/migrations/*.sql`

외부 연동 원칙:

- 기본 권장 방식은 REST API 연동입니다.
- DB 직접 접근은 내부 운영/마이그레이션 목적 외에는 권장하지 않습니다.
- DB 직접 연동이 필요하면 읽기 전용 계정, 접근 IP, 테이블 범위, 개인정보 처리 범위를 별도 합의해야 합니다.

## 12. 권한 모델

사용자 role:

- `super_admin`
- `admin`
- `manager`
- `project_owner`
- `member`

일반 원칙:

- `super_admin`, `admin`: 관리자 기능 접근
- `manager`, `project_owner`, `admin`, `super_admin`: 프로젝트/업무/제품/결정사항 쓰기 권한
- `member`: 본인이 접근 가능한 방/프로젝트 중심 읽기 및 제한적 쓰기
- 채팅방/프로젝트/파일/메시지는 멤버십 기반 접근 제어 적용

## 13. 외부 연동 시 결정해야 할 항목

외부 개발자에게 아래 항목을 확인받아야 합니다.

- 이번 요청의 1차 범위는 MES 생산 LOT 데이터 연동입니다.
- 연동 방향: 외부 프로그램 -> Hanmir Talk, Hanmir Talk -> 외부 프로그램, 양방향
- 연동 방식: REST polling, Socket.IO 실시간 구독, webhook 신규 개발, 파일 연동, DB 읽기 전용 중 선택
- 인증 방식: 기존 사용자 세션, 별도 서비스 계정, 신규 API Key 방식 중 선택
- 데이터 범위: 사용자, 부서, 프로젝트, 업무, 제품, 파일, 공지, 메시지 중 어떤 데이터를 연동할지
- 쓰기 권한 필요 여부: 조회만 할지, 생성/수정/삭제까지 할지
- 운영 URL 및 테스트 URL
- 외부 서버 IP allowlist 필요 여부
- CORS 허용 Origin
- 장애/재시도 정책
- 개인정보/첨부파일 포함 여부
- 로그 보관 및 감사 요구사항

## 14. 현재 없는 기능 또는 추가 개발이 필요한 지점

현재 코드 기준으로 아래 항목은 별도 개발이 필요할 수 있습니다.

- 외부 시스템 전용 장기 API Key
- OAuth2 client credentials
- 외부 시스템으로 보내는 outbound webhook
- MES 생산 LOT 대량 upsert/import 전용 API
- MES 제품코드와 Hanmir Talk 제품 ID 매핑 관리 화면 또는 매핑 테이블
- OpenAPI/Swagger 자동 생성 문서
- Redis 기반 세션/Socket presence 저장소
- 외부 스토리지 S3/MinIO 연동
- SMS/카카오 알림 연동
- Google Drive/Calendar 연동

## 15. 외부 전달용 빠른 요약

```text
Hanmir Talk는 npm workspaces 기반 TypeScript 모노레포입니다.
프론트엔드는 Next.js 14 + React 18, 백엔드는 Express 4 + Socket.IO 4, DB는 PostgreSQL 16입니다.
운영 배포는 Docker Compose로 web/server/postgres/caddy 컨테이너를 구성합니다.
REST API 기본 prefix는 /api/v1이고, 실시간 이벤트는 Socket.IO /socket.io 경로를 사용합니다.
인증은 httpOnly cookie 기반 세션 + refresh token rotation이며, 스크립트/서버 연동용 Authorization: Bearer token도 일부 지원합니다.
파일 업로드는 multipart/form-data field name=file, 기본 50MB 제한입니다.
공용 DTO 타입은 packages/shared/src/types.ts에 있습니다.
이번 외부 연동의 1차 범위는 MES 생산 LOT 데이터를 Hanmir Talk 제품별 생산 LOT 영역에 반영하는 것입니다.
필요 LOT 필드는 LOT 번호, 생산일, 수량, 판정, 시험일, 비고입니다.
현재 외부 시스템 전용 API Key나 outbound webhook은 없으므로, 장기 서버 간 연동이 필요하면 서비스 계정/API Key 또는 webhook 개발 범위를 별도 확정해야 합니다.
```

## 16. ChatGPT 문서 작업용 프롬프트

외부 문서나 계약/연동 명세를 ChatGPT로 정리할 때 아래 프롬프트를 함께 전달하면 됩니다.

```text
아래 Hanmir Talk 기술 스택 문서를 바탕으로 외부 연동 개발자에게 전달할 연동 명세서를 작성해 주세요.
문서는 비개발자도 이해할 수 있는 요약과 개발자가 바로 확인할 수 있는 API/인증/환경 구성 섹션을 모두 포함해야 합니다.
실제 비밀번호, API Key, 내부 IP는 절대 포함하지 말고 <운영도메인>, <테스트계정>, <토큰> 같은 placeholder로 표시해 주세요.
이번 연동 범위는 MES 전체 기능이 아니라 MES 생산 LOT 데이터를 Hanmir Talk의 제품별 생산 LOT 영역에 자동 반영하는 것입니다.
Hanmir Talk에 필요한 LOT 필드는 LOT 번호, 생산일, 수량, 판정(pass/hold/retest), 시험일, 비고입니다.
MES 업체에는 API 제공 가능 여부, API가 없을 때 CSV/Excel/DB View/파일 Export 가능 여부, 제품 매핑 기준, LOT 중복 기준, 신규/수정/취소 전달 범위, 테스트 샘플 데이터 제공 가능 여부를 확인해야 합니다.
외부 시스템 전용 API Key, OAuth2, outbound webhook은 현재 없으므로 추가 개발 필요 항목으로 분리해 주세요.
```
