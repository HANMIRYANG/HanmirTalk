# Codex Review Guide

This document defines how Codex should review Claude Code results for this
project. The goal is to prevent hallucinated progress, misplaced priorities,
and accidental acceptance of incomplete work.

## Core Rule

Do not trust a summary by itself. Always verify claims against the actual code,
documents, and command output.

When Claude Code reports work as complete, Codex must classify each claim as:

- Completed
- Partially completed
- Not implemented
- Summary/code mismatch
- Needs follow-up

## Priority Order

Use this order when deciding the next implementation prompt.

### P0: Foundation

- Authentication, session, logout, and authorization correctness
- PostgreSQL schema, migrations, and repository adapter structure
- Stable repository interfaces
- Security-sensitive backend behavior
- Build/typecheck health

### P1: Core Business Features

- Admin user CRUD
- Department CRUD
- Project CRUD and project member management
- Task CRUD and task status updates
- Product CRUD and sales status updates
- Notice write/read-status flows
- File upload/download metadata and access control

### P2: Operations and Realtime

- WebSocket events
- Notifications
- Audit logs
- Soft delete
- Redis/session persistence
- File storage integration

### P3: Convenience and Advanced Features

- `@` mention UI and mention notifications
- `/` AI commands
- AI summaries and extraction
- Advanced search and automation

P3 features must not be implemented before P0/P1 gaps are handled, unless the
user explicitly reprioritizes them.

## Required Review Procedure

### 1. Compare Summary to Files

For every file Claude Code says it changed:

- Confirm the file exists.
- Open the file.
- Verify the described function, route, type, or behavior exists.
- Distinguish documentation-only changes from implemented code.

### 2. Compare API Spec to Routes

Use `docs/08_API_SPEC.md` as the contract.

For each API claim:

- Check the actual route in `server/src/routes/*`.
- Confirm method and path.
- Confirm request body handling.
- Confirm response shape where practical.
- Confirm `requireAuth` / `requireRole` is applied where required.

### 3. Check Repository Behavior

Review:

- `server/src/repositories/types.ts`
- `server/src/repositories/memory.ts`
- any PostgreSQL repository files
- schema and migration files

Do not accept "CRUD implemented" unless the repository actually mutates state
or persists data according to the current storage mode.

### 4. Check Frontend Integration

Review:

- `apps/web/src/services/*`
- relevant pages under `apps/web/src/app`
- relevant components under `apps/web/src/components`

Confirm that UI buttons/forms actually call services. If a button exists but
does not call an API, classify it as UI-only.

### 5. Run Verification Commands

Run these whenever code changed:

```bash
npm.cmd run typecheck
npm.cmd run build:server
npm.cmd run build
```

If backend behavior changed, run focused smoke tests against the Express app.
Prefer an in-process temporary server when possible, so the test closes cleanly.

### 6. Report Findings First

If issues exist, lead with findings ordered by severity.

Use this format:

- Severity
- File/path reference
- What is wrong
- Why it matters
- What should be done next

Only after findings, include:

- What passed
- What is complete
- What remains
- Recommended next prompt

## Anti-Hallucination Rules

- Never say "implemented" for a feature seen only in docs.
- Never say "verified" unless a command or direct file inspection supports it.
- Never assume a route exists because it appears in `docs/08_API_SPEC.md`.
- Never assume a frontend button is functional without checking its handler.
- Never assume persistence exists while the app still uses memory repositories.
- Never promote P3 convenience features ahead of P0/P1 essentials without user approval.

## Current Project State Baseline

As of 2026-05-26 (Phase 0~9 완료, 운영 배포 골격 작성 완료):

### Backend (Express + socket.io, 21 route modules, 17 migrations)

- **Auth (Phase 1)**: bcryptjs hash, httpOnly+SameSite=Strict cookies, access
  60min + refresh 30day with rotation, must_change_password gate, audit log
  on admin login success/failure + password change.
- **Repositories**: 메모리(dev) + PostgreSQL(운영) 두 어댑터, `DATABASE_URL`로
  분기. PG 어댑터는 `pg` driver 직접 사용(ORM 없음). 17개 인터페이스
  (users·departments·rooms·messages·projects·tasks·products·files·notices·
  decisions·notifications·pushSubscriptions·audit·refreshTokens·invitations·
  orgNotifications). PG 어댑터 LOC 약 3,100줄.
- **마이그레이션 001~017** 모두 작성·idempotent. 운영 시드(003)는 부서 12개
  + 사용자 22명(2026-05-21 한미르 실 조직 반영).
- **Write CRUD 전부 구현**: users / departments / rooms(+direct+mute+leave+
  members) / messages(append+edit+delete+search+pin+read) / files(upload+
  download+delete) / products(+specs+lots+documents+sales-history) /
  notices(+confirm+read-status) / projects(+members+soft-delete) / tasks /
  decisions(+confirm+read-status+createFromMessage) / invitations / push.
- **권한**: 룸 멤버십 검증(D-8 ensureRoomAccess) + 프로젝트 ownership
  검증(D-5 ensureProjectAccess) + writer role 분리(admin/super_admin/
  manager/project_owner) + admin only 라우트(`requireRole`).
- **감사 로그**: 모든 admin·write 액션에 hook. `audit_logs` 테이블 + 필터
  검색 API + `/admin/audit` 페이지.
- **실시간(socket.io)**: handshake에서 access 쿠키 검증, room/project/user
  채널 자동 join, message:new/updated/deleted/room:pin/notice:new/
  decision:new/notification:new 등 emit.
- **알림(Phase 6)**: 메시지·공지·업무 배정·프로젝트 상태·멘션·결정사항 6종
  자동 발송. user_notification_settings(개인) + org_notification_defaults
  (전사 카테고리 게이트). Web Push(VAPID) 자동 fanout.
- **AI(Phase 5)**: Anthropic `@anthropic-ai/sdk` — 5종 명령(summarize/
  extract-tasks/extract-decisions/draft-notice/minutes). per-user in-memory
  rate bucket(5/min, 30/day, 일일 토큰 상한). entities[] sanitize.
- **검색(Phase 9)**: 통합 검색 `/search?q=&scope=` — 메시지(FTS+trgm,
  방 멤버십 스코프) + 파일/프로젝트/제품(substring).

### Frontend (Next.js 14 app router, CSS Modules)

- `/dashboard` (Phase 7 종합), `/chat` + `[roomId]`(필터·고정·읽음·핀·편집·
  삭제·멘션·AI), `/projects` + `[id]/{tasks,gantt,files,decisions}`,
  `/products` + `[id]` 6탭, `/files`(필터·검색·뷰 토글), `/notices`,
  `/search`, `/account/{password,notifications}`,
  `/admin/{audit,invitations,notifications,permissions,security,status}`,
  공개 `/invite/[token]` 수락 페이지.
- PWA: manifest + sw.js + PwaRegister (HTTPS/localhost 한정).
- Topbar 실 사용자 표시 + NotificationBell(socket 실시간 배지).

### 인프라

- **dev**: `docker-compose.yml` = postgres-16 + mailhog. `npm run dev`로
  web+server 동시 기동.
- **prod**: `docker-compose.prod.yml` = caddy + web + server + postgres.
  `name: hanmir-talk-prod`로 dev 격리. 빈 볼륨 최초 기동에서만 마이그
  001~017 자동 적용.
- **Caddy**: 사내 HTTP 평문(`:80`). HTTPS 전환 절차는 Caddyfile 상단 주석.
- **운영 배포 N-1**: Dockerfile + compose + Caddyfile + .env.prod.example
  작성 완료. 빌드/기동 검증 통과. **Proxmox VM 생성·실 .env.prod 작성·
  실 배포·백업 cron·복원 리허설은 미수행**(N-1 후반 ~ N-5).

### 남은 작업 (P 우선순위)

- **P1**: 운영 배포(N·R절) — Proxmox VM, .env.prod 실값, docker compose up,
  백업 cron, 복원 리허설.
- **P2**: 잔여 기능 — 마감 임박 task 알림 cron, AI 결과 메시지의
  ai_generated/ai_command/source_message_ids 영속화.
- **P3**: Phase 10 메시지 에디터 — 마크다운, 이모지 picker, 예약 전송
  (마지막 항목은 운영 가동 후로 보류 결정).

### 정책 변동(이전 baseline 대비)

- 단일 VM 운영 결정(N-0)으로 NestJS·Redis·MinIO 권장은 폐기, Express +
  로컬 디스크 + 인메모리 세션으로 단순화. `docs/16`에 반영됨.
- 채팅방 멤버십 권한 결함(D-8)이 2026-05-19 차단됨. 이후 새 라우트는
  `ensureRoomAccess` / `ensureProjectAccess` 패턴 의무.
- `@` 멘션과 `/` AI 명령은 Phase 5에서 정식 구현되어 더 이상 P3 미구현
  항목이 아님.

This baseline must be rechecked after each Claude Code result.

