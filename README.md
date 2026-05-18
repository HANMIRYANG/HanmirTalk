# Hanmir Talk Project Docs - No UI Version

이 문서 세트는 한미르주식회사 내부용 사내 메신저/프로젝트 관리 시스템 **한미르톡** 개발을 위한 기능·DB·API·권한·PWA·검증 문서입니다.

이번 수정본에서는 UI 디자인 문서를 제거했습니다. 화면 디자인은 Claude Design에서 별도 HTML 레퍼런스로 제작하고, Claude Code는 그 HTML 레퍼런스를 기준으로 기능 구현만 수행합니다.

## 핵심 방향

- 서비스 언어: 한국어
- 사용 환경: PC 웹 + 모바일 PWA
- 사용성 기준: 카카오톡처럼 익숙하고 단순한 사용 흐름
- 기능 구조: Slack형 채널/프로젝트 관리 + 제조업 업무 흐름


## 폴더 구조

```txt
hanmir-talk-project-docs-no-ui/
  docs/
  prompts/
  design-reference/html/
  assets/logo/hanmir-logo.png
  apps/web/
  server/
  packages/shared/
```

## 개발 순서

1. Claude Design에 `prompts/CLAUDE_DESIGN_HTML_REFERENCE_PROMPT.md`를 전달하여 HTML 레퍼런스를 만든다.
2. 생성된 HTML 파일들을 `design-reference/html/`에 넣는다.
3. Claude Code에 `prompts/CLAUDE_CODE_ENGLISH_START_PROMPT.md`를 전달한다.
4. Claude Code는 docs 문서와 HTML 레퍼런스를 기준으로 구현한다.
5. Codex는 `prompts/CODEX_REVIEW_PROMPT.md`와 체크리스트 기준으로 검증한다.

## 중요한 원칙

Claude Code는 UI를 새로 디자인하지 않습니다. HTML 레퍼런스의 레이아웃, 톤앤매너, 색상, 간격, 폰트 크기, 버튼 형태를 유지해야 합니다.

한미르 로고는 서비스의 중심 브랜드 요소입니다. 로고가 묻히지 않도록 깨끗한 배경, 충분한 여백, 절제된 색상 사용을 기본 원칙으로 합니다.

## 실행 방법

루트에서 한 번 의존성 설치:

```bash
npm install
```

### 백엔드 (Express + TypeScript, in-memory seed adapter)

```bash
# 개발 모드 (tsx watch, 기본 PORT=4000, API prefix /api/v1)
npm run dev:server

# 빌드 + 프로덕션 실행
npm run build:server
npm run start:server
```

### 로컬 PostgreSQL (Docker)

```bash
npm run db:up         # postgres:16-alpine 컨테이너 기동 + 001/002/003 자동 적용
npm run db:psql       # 컨테이너 안 psql 진입
npm run db:migrate    # 마이그레이션 수동 재적용 (idempotent)
npm run db:reset      # 볼륨까지 wipe하고 재기동 (DB 초기화)
npm run db:down       # 컨테이너 중지 (볼륨은 보존)
```

`DATABASE_URL=postgres://hanmir:hanmir_dev@localhost:5432/hanmir_talk`로 세팅하면 백엔드가 PostgreSQL 어댑터를 사용합니다 (부팅 로그 `repository adapter: postgres`).

환경 변수:

- `PORT` (기본 `4000`)
- `API_PREFIX` (기본 `/api/v1`)
- `CORS_ORIGIN` (기본 `http://localhost:3000`, 콤마 구분 다중 허용)
- `DEFAULT_PASSWORD` (개발용 공용 비밀번호, 기본 `hanmir1234`)

헬스 체크: `GET http://localhost:4000/api/v1/health`

### 프론트엔드 (Next.js)

```bash
# 개발 모드
npm run dev

# 빌드 + 프로덕션 실행
npm run build
npm run start
```

API base URL은 `NEXT_PUBLIC_API_BASE_URL` 환경 변수로 지정합니다(기본값 `http://localhost:4000/api/v1`). 예:

```bash
# apps/web/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

### 검증

```bash
npm run typecheck   # 모든 워크스페이스 (web + shared + server) 타입체크
npm run build       # 프론트 프로덕션 빌드
npm run build:server # 백엔드 컴파일
```

## 로그인 정보 (개발용)

비밀번호는 모두 `hanmir1234` (백엔드 `DEFAULT_PASSWORD` 환경 변수와 일치).

| 시드 계정 | 이메일 | 역할 | 비고 |
| --- | --- | --- | --- |
| 김민준 | `kim.minjun@hanmir.co.kr` | `manager` | 기본 사용자, 일반 페이지 권한 |
| 박지영 | `park.jiyoung@hanmir.co.kr` | `project_owner` | 프로젝트 책임자 |
| 강은혜 | `kang.eunhye@hanmir.co.kr` | `admin` | `/admin`, admin dashboard 접근 가능 |
| 정민호 | `jung.minho@hanmir.co.kr` | `super_admin` | `/admin`, admin dashboard 접근 가능 |

`/admin` 페이지 및 `GET /api/v1/dashboard/{admin-kpis,audit,dept-stats,overview}`는 `admin` / `super_admin`만 접근 가능합니다. 그 외 사용자가 `/admin`에 접근하면 `/chat`으로 redirect됩니다.

성공 시 access token이 응답으로 내려오고 프론트는 `hanmir_token` 쿠키(`SameSite=Lax`)에 저장합니다. 서버 컴포넌트는 `cookies()`를 통해, 클라이언트 `fetch`는 `credentials: "include"`를 통해 같은 쿠키를 사용합니다. 무토큰 상태로 `/chat` 등에 접근하면 `/login`으로 redirect됩니다.

## 기능 구현 현황 요약 (2026-05-18 기준)

docs `15_DEVELOPMENT_PHASES.md` 기준 진척도. 백엔드 라우트와 프론트 UI는 별도로 평가합니다.

| Phase | 항목 | 백엔드 | 프론트 UI |
| --- | --- | --- | --- |
| 1 | Monorepo / 환경 / typecheck / build | ✅ | ✅ |
| 2 | 로그인 / 세션 / `/auth/me` 가드 | ✅ | ✅ (`/login`, layout 가드) |
| 2 | User CRUD | ✅ (admin-only) | ✅ (`/admin`) |
| 2 | Department CRUD | ✅ (admin-only) | ✅ (`/admin`) |
| 2 | 역할/권한 (`requireRole`) | ✅ (`admin/super_admin`, writer 4종) | ✅ (admin redirect, 403 인라인) |
| 3 | 채팅방 read | ✅ | ✅ (`/chat`, `/chat/[roomId]`) |
| 3 | 메시지 보내기 | ✅ (append, 인증 필수) | ✅ (`MessageComposer`) |
| 3 | WebSocket (`message:new` 등) | ❌ | ❌ |
| 3 | 파일/이미지 첨부 업로드 | ❌ | ❌ |
| 3 | 읽음 처리 / unread / mute / pin write | ❌ | ❌ |
| 4 | 공지 read + 확인 | ✅ | ✅ (`/notices`, 확인 버튼) |
| 4 | 공지 작성 / 확인자 조회 | ✅ (admin only) | ✅ (`+ 공지 작성` 모달, 카드별 `확인 현황` 모달) |
| 5 | Project CRUD + 멤버 (soft delete) | ✅ | ✅ (`/projects` 생성, `/projects/[id]` 수정·취소·멤버 추가/제외) |
| 5 | Task CRUD + 상태 변경 | ✅ | ✅ (`/projects/[id]/tasks` 인라인 편집 + 생성 모달) |
| 5 | Project 진행률/지연 자동 집계 | ✅ (memory CUD/PG read 모두) | ✅ (목록/카드 표시) |
| 6 | 제품 read | ✅ | ✅ (`/products`, `/products/[id]`) |
| 6 | 제품 등록/수정/문서/영업상태 변경 | ❌ | ❌ |
| 7 | 관리자 KPI/감사/부서통계 | ✅ (seed) | ✅ (`/admin`) |
| 7 | `/dashboard` 종합 화면 | ❌ (라우트는 있으나 페이지 없음) | ❌ |
| 7 | 검색 (메시지/파일/프로젝트) | ❌ | ❌ |
| 7 | PWA / 모바일 최적화 점검 | — | 부분 (모바일 nav만) |
| - | PostgreSQL 어댑터 | ✅ (코드/마이그레이션/실DB smoke 모두 완료) | — |

기호: ✅ 구현 완료, ⚠️ 부분 구현 / UI 미연결, ❌ 미착수

## API / Frontend 매핑 현황

| Endpoint | Status | Frontend service | UI 연결 |
| --- | --- | --- | --- |
| `POST /auth/login` | seed (메모리 세션) | `authService.login` | `/login` |
| `POST /auth/logout` | seed | `authService.logout` | Sidebar 로그아웃 |
| `GET /auth/me` | seed | `authService.getMe` / `tryGetMe` | layout 가드 |
| `GET /users` | seed/PG | `userService.listUsers` | `/admin`, 업무 페이지 lookup |
| `GET /users/:id` | seed/PG | `userService.getUser` | (lookup) |
| `POST /users` | seed/PG | `userService.createUser` | `/admin` 사용자 추가 모달 |
| `PATCH /users/:id` | seed/PG | `userService.updateUser` | `/admin` 사용자 수정 모달 |
| `PATCH /users/:id/deactivate` | seed/PG | `userService.deactivateUser` | `/admin` 사용자 비활성화 |
| `GET /departments` | seed/PG | `departmentService.listDepartments` | `/admin` 부서 카드 |
| `POST /departments` | seed/PG | `departmentService.createDepartment` | `/admin` 부서 추가 |
| `PATCH /departments/:id` | seed/PG | `departmentService.updateDepartment` | `/admin` 부서 수정 |
| `DELETE /departments/:id` | seed/PG | `departmentService.deleteDepartment` | `/admin` 부서 삭제 |
| `GET /rooms` | seed/PG | `chatService.listRooms` | `/chat` |
| `GET /rooms/:id` | seed/PG | `chatService.getRoom` | `/chat/[roomId]` |
| `GET /rooms/:roomId/messages` | seed/PG | `chatService.listMessages` | `/chat/[roomId]` |
| `POST /rooms/:roomId/messages` | in-memory/PG append | `chatService.sendMessage` | `MessageComposer` |
| `GET /rooms/:roomId/pinned` | seed (PG: undefined) | `chatService.getPinnedMessage` | `/chat/[roomId]` 핀 배너 |
| `GET /projects` | seed/PG | `projectService.listProjects` | `/projects` |
| `GET /projects/:id` | seed/PG | `projectService.getProject` | `/projects/[id]` |
| `POST /projects` | seed/PG | `projectService.createProject` | **UI 미연결** |
| `PATCH /projects/:id` | seed/PG | `projectService.updateProject` | **UI 미연결** |
| `DELETE /projects/:id` (soft, → cancelled) | seed/PG | `projectService.deleteProject` | **UI 미연결** |
| `POST /projects/:id/members` | seed/PG | `projectService.addProjectMember` | **UI 미연결** |
| `DELETE /projects/:id/members/:userId` | seed/PG | `projectService.removeProjectMember` | **UI 미연결** |
| `GET /projects/:projectId/tasks` | seed/PG | `taskService.listByProject` | `/projects/[id]/tasks` |
| `POST /projects/:projectId/tasks` | seed/PG | `taskService.createTask` | **UI 미연결** (`+ 업무 추가` 버튼은 스텁) |
| `GET /tasks/:id` | seed/PG | `taskService.getTask` | **UI 미연결** |
| `PATCH /tasks/:id` | seed/PG | `taskService.updateTask` | **UI 미연결** |
| `DELETE /tasks/:id` | seed/PG | `taskService.deleteTask` | **UI 미연결** |
| `GET /products` | seed/PG | `productService.listProducts` | `/products` |
| `GET /products/:id` | seed/PG | `productService.getProduct` | `/products/[id]` |
| `GET /files` | seed/PG | `fileService.listFiles` | `/files` |
| `GET /files/folders` | seed (PG: 빈 배열) | `fileService.listFolders` | `/files` |
| `GET /files/:id` | seed/PG | (UI 미사용) | — |
| `GET /notices` | seed/PG | `noticeService.listNotices` | `/notices` |
| `POST /notices` | seed/PG (admin) | `noticeService.createNotice` | `/notices` `+ 공지 작성` 모달 |
| `GET /notices/:id` | seed/PG | `noticeService.getNotice` | (UI 미사용) |
| `GET /notices/:id/read-status` | seed/PG (admin) | `noticeService.getReadStatus` | `/notices` 카드 `확인 현황` 모달 |
| `POST /notices/:id/confirm` | in-memory/PG | `noticeService.confirmNotice` | `NoticeConfirmButton` |
| `GET /dashboard/overview` | seed | (UI 미사용) | — |
| `GET /dashboard/admin-kpis` | seed | `dashboardService.listAdminKpis` | `/admin` |
| `GET /dashboard/audit` | seed | `dashboardService.listAudit` | `/admin` |
| `GET /dashboard/dept-stats` | seed | `dashboardService.listDeptStats` | `/admin` |
| `GET /dashboard/activities` | seed | `dashboardService.listDashboardActivities` | (UI 미사용) |
| `GET /dashboard/project-activities` | seed | `dashboardService.listProjectActivities` | (UI 미사용) |

> seed/PG: memory 어댑터(`server/src/seed/*.ts`) 기본. `DATABASE_URL` 설정 시 동일 인터페이스를 Postgres 어댑터(`server/src/repositories/postgres.ts`)가 처리. dashboard 계열은 양쪽 모드 모두 seed 데이터 그대로.
>
> **UI 미연결**: 백엔드 라우트 + 프론트 service 함수까지는 구현되어 있으나 페이지에서 호출하는 버튼/폼이 아직 존재하지 않습니다. (자세한 미구현 항목은 본 문서 하단 "TODO" 참조.)

## 백엔드 구조

```
server/
  src/
    app.ts                 Express 앱 부트스트랩
    config.ts              포트/CORS/기본 패스워드
    index.ts               엔트리
    auth/
      middleware.ts        토큰 → currentUser 주입, requireAuth
      session.ts           in-memory access token store
    repositories/
      types.ts             repository 인터페이스 (DB adapter 교체 지점)
      memory.ts            in-memory seed adapter (현재 기본)
      postgres.ts          PostgreSQL adapter (users/depts/projects/tasks/rooms/messages/products/files/notices)
    routes/
      auth.ts users.ts rooms.ts projects.ts products.ts
      files.ts notices.ts departments.ts dashboard.ts
    seed/
      users.ts rooms.ts messages.ts projects.ts tasks.ts
      products.ts files.ts notices.ts dashboard.ts departments.ts
    db/
      schema.sql                                정식 PostgreSQL 스키마 (참조용)
      migrations/001_initial.sql                초기 스키마 마이그레이션
      migrations/002_extend_projects_tasks.sql  DTO-extra 컬럼 추가
      migrations/003_seed_minimum.sql           로그인용 부서/사용자 시드
```

repository 인터페이스(`repositories/types.ts`)와 메모리 어댑터(`repositories/memory.ts`)가 분리되어 있으므로, PostgreSQL adapter를 추가하는 시점에는 `createApp()`에 다른 `Repositories` 구현을 주입하기만 하면 됩니다.

## 실행 모드: memory / postgres

| 모드 | 사용 어댑터 | 활성 조건 | 특징 |
| --- | --- | --- | --- |
| memory (default) | `createMemoryRepositories()` | `DATABASE_URL` 미설정 | 시드 데이터로 즉시 동작. 재시작 시 in-memory 상태 휘발. |
| postgres | `createPostgresRepositories(pool)` | `DATABASE_URL` 설정 | 영속 저장. `users` / `departments` / `projects` / `tasks` 만 실제 구현됨 (아래 표 참고). |

서버 부팅 시 `[hanmir-server] repository adapter: memory|postgres` 로그로 어느 어댑터가 활성인지 확인할 수 있습니다.

### memory mode (현재 기본)

```powershell
npm run dev:server   # 백엔드, http://localhost:4000/api/v1
npm run dev          # 프론트, http://localhost:3000
```

### postgres mode 활성화 절차

1. PostgreSQL DB 생성. `pgcrypto` 확장은 `001_initial.sql`이 자동으로 추가합니다.
2. 마이그레이션을 **순서대로** 적용:
   ```bash
   psql "$DATABASE_URL" -f server/src/db/migrations/001_initial.sql
   psql "$DATABASE_URL" -f server/src/db/migrations/002_extend_projects_tasks.sql
   psql "$DATABASE_URL" -f server/src/db/migrations/003_seed_minimum.sql
   psql "$DATABASE_URL" -f server/src/db/migrations/004_notices_optional_room.sql
   ```
   - `001`: 초기 스키마.
   - `002`: shared `Project` / `TaskItem` DTO가 쓰지만 `001`에 빠져 있던 컬럼(`code`, `full_name`, `goals`, `outputs` 등) 추가.
   - `003`: 부서 6개 + admin/super_admin/manager/project_owner 로그인용 시드 사용자 4명. idempotent (`ON CONFLICT DO NOTHING`).
   - `004`: `notices.room_id`를 nullable로 변경 (MVP 공지 작성에 room이 필요 없음). idempotent.
3. `.env` 또는 환경에 `DATABASE_URL=postgres://user:pass@host:5432/hanmir_talk`.
4. `npm run dev:server` 또는 `npm run build:server && npm run start:server`로 기동. 로그에 `repository adapter: postgres`가 보이면 활성 상태.

### Postgres adapter 구현 범위

| Repository | postgres 구현 상태 | 비고 |
| --- | --- | --- |
| `users` | ✅ list / findById / findByEmail / create / update / deactivate | |
| `departments` | ✅ list / findById / create / update / delete | hard delete + in-use 체크. soft delete는 TODO. |
| `projects` | ✅ list / findById / create / update / cancel(soft) / addMember / removeMember | memberIds + taskCounts + delayedCount 모두 SQL에서 집계 |
| `tasks` | ✅ list / listByProject / findById / create / update / delete | DTO `assigneeIds`는 첫 번째만 영속화 (TODO: `task_assignees` 조인 테이블) |
| `rooms` | ✅ list / findById | members/lastMessage* SQL 집계. `unread`/`muted`/`pinned`은 0/undefined 기본값 (TODO: 사용자별 unread). |
| `messages` | ✅ listByRoom / append. `getPinned`은 undefined 반환 | pinned 모델이 schema에 없음 (후속 migration). |
| `products` | ✅ list / findById | spec/lots/history/documents/quarter 등 별도 테이블이 없는 필드는 빈 배열/기본값. |
| `files` | ✅ listFolders / listFiles / findById | `attachments`를 `FileEntry`로 변환. folders는 빈 배열 반환 (테이블 없음). |
| `notices` | ✅ list(userId?) / findById(id, userId?) / create / markConfirmed(id, userId) / getReadStatus(id) | `notice_reads`로 사용자별 확인 상태 추적. tone은 `is_required`에서 파생. `room_id`는 nullable (마이그레이션 004). |
| dashboard (KPI / audit / activities) | seed 데이터 (양쪽 mode 동일) | LLM/실데이터 연동은 후속. |

> Postgres mode를 켜면 위 표의 read API + 기존 write API(user/department/project/task CRUD, message append, notice confirm)가 정상 동작합니다. 채팅의 pinned 배너, 파일함의 폴더 그리드, 제품 상세의 LOT/시험성적서 섹션 등 schema에 없는 정보는 빈 상태로 노출되지만 페이지 자체가 깨지진 않습니다.

### Postgres smoke 상태

| 구분 | 상태 |
| --- | --- |
| typecheck / build / build:server | ✅ 통과 |
| 어댑터 부팅 분기 (`DATABASE_URL` → `repository adapter: postgres` 로그) | ✅ 확인 |
| 중앙 에러 핸들러로 `500 { "error": "internal_error" }` 일관 응답 (DB 도달 불가 시) | ✅ 확인 |
| 실제 Postgres DB에 001/002/003 migration 적용 후 종단간 read/write smoke | ✅ **2026-05-18 수행 완료** |

검증 방법:

```bash
npm run db:up         # postgres:16-alpine 컨테이너 기동 + initdb.d로 001/002/003 자동 적용
DATABASE_URL=postgres://hanmir:hanmir_dev@localhost:5432/hanmir_talk \
  npm run build:server && npm run start:server
# 부팅 로그: `repository adapter: postgres`
```

확인된 종단간 동작 (kang.eunhye@hanmir.co.kr admin / kim.minjun manager / 새로 만든 member 계정 양홍준):

- 로그인 / `/auth/me` / 401 (무토큰) / 403 (admin-only 라우트에 manager) — 정상
- 사용자 CRUD: 생성 → 로그인 가능 → deactivate 후 부서 hard-delete 성공 (in-use 시 409 → deactivate 후 200)
- 부서 CRUD: create / update / delete (in-use 시 409) — 정상
- 프로젝트 CRUD: create / update / member add×2 (idempotent) / member remove / soft-delete(status=cancelled) — 정상
- 업무 CRUD: create / patch (status·progress) / delete — 정상
- `taskCounts.done/inProgress/pending/total`가 task CUD 후 **다음 GET project**에서 fresh 집계 (SQL 서브쿼리) — 확인
- 대시보드 dashboard/activities는 seed (양 어댑터 동일), `/dashboard/admin-kpis`는 admin 전용 가드 유지
- DB 영속성: 컨테이너 재기동 후 cancelled 프로젝트·project_members·비활성 사용자 모두 보존

검증 중 발견·수정한 버그 1건:

- `projects.sales_status`는 NOT NULL인데 Postgres 어댑터의 `PgProjectRepository.create`가 `input.salesStatus ?? null`로 명시 NULL을 전달해 `salesStatus` 없이 프로젝트를 만들면 항상 23502로 실패. 어댑터에서 `input.salesStatus ?? "preparing"`로 변경. (스키마 컬럼 default가 한국어 `'준비중'`이라 enum과 불일치 — 이건 영향 없으나 후속 마이그레이션으로 default를 `'preparing'`으로 맞추는 것이 깔끔. TODO에 추가.)

미수행 / 한계:

- `rooms` / `messages` / `notices` / `products` / `files`는 seed 마이그레이션이 비어 있어 read는 빈 배열만 반환. 실제 row가 들어간 상태의 read/write smoke는 다음 단계(공지/파일/제품 write 구현 시) 함께 검증.
- pinned 메시지, file_folders 등 schema에 없는 컬럼/테이블은 어댑터가 빈 값/undefined 반환 (README "Postgres adapter 구현 범위" 참고).

### Mapper / default 정책

- 날짜 컬럼(`DATE`)은 `formatDate()` 헬퍼로 `YYYY-MM-DD` 문자열로 직렬화.
- `TaskItem.assigneeIds`는 DB의 단일 `assignee_id` 컬럼을 배열로 wrapping. **첫 번째 담당자만 영속화** — 다수 담당자 지원은 TODO (`task_assignees` join 테이블 도입).
- `Project.taskCounts` / `delayedCount`는 `project_members` join + `tasks` 상태 집계 서브쿼리로 계산. 매 조회 시 fresh.
- `Project.milestones`는 별도 테이블이 없으므로 빈 배열 반환 (memory mode와 동일한 표시).
- `Project.created_by`는 NOT NULL이므로 어댑터가 admin/super_admin 중 한 명을 임시로 채워 넣습니다. 향후 request의 `currentUser`를 repository에 주입해 실제 작성자를 기록할 예정 (TODO).
- `Department.list()`은 `is_active IS NOT FALSE`만 반환 (memory와 동일).
- `User.list()`은 비활성 사용자도 포함합니다 (memory와 동일). 화면에서 휴직/활성 상태는 `presence`/`isActive`로 표시.
- `User.password_hash`는 `pending-bcrypt-migration` placeholder. 로그인은 `config.defaultPassword`와 직접 비교하므로 이 값은 사용되지 않습니다. **bcrypt/argon2 도입 시 시드와 함께 마이그레이션 필요** (TODO).

## 에러 처리

- `express-async-errors`를 import해서 async route에서 throw/reject된 에러가 자동으로 중앙 에러 핸들러로 라우팅됩니다.
- 중앙 핸들러는 모든 요청에 대해 `500 { "error": "internal_error" }`만 반환합니다. 세부 스택/메시지는 서버 로그에만 남고 클라이언트에 노출하지 않습니다.
- dev (`NODE_ENV !== "production"`)에서는 stack trace까지, production에서는 `name: message`만 로깅.
- 라우트 내부에서 의도적으로 4xx를 던질 때는 기존처럼 `res.status(4xx).json(...)`로 명시적으로 응답하세요. 중앙 핸들러는 4xx 응답을 가로채지 않습니다.

## 인증 / write 보호 정책

- `attachCurrentUser`는 유효한 access token이 있을 때만 `req.currentUser`를 설정합니다. dev fallback은 제거되었습니다.
- 토큰은 `Authorization: Bearer <token>` 헤더 또는 `hanmir_token` 쿠키로 전달합니다. 추출 로직은 `server/src/auth/token.ts`의 `extractToken(req)`에 공통화되어 middleware와 `/auth/logout`이 같이 사용합니다.
- `GET /auth/me`는 `requireAuth`로 보호되어 무토큰 호출 시 `401 { error: "unauthorized" }`를 반환합니다.
- `/api/v1`의 모든 read/write 엔드포인트(`/auth` 제외, `/health` 제외)에 `requireAuth`가 걸려 있습니다.
- admin 전용: `GET /dashboard/{admin-kpis,audit,dept-stats,overview}`에 `requireRole("admin", "super_admin")`. 권한 없는 토큰은 `403 { error: "forbidden" }`.
- 프론트 `(app)/layout.tsx`가 cookie의 `hanmir_token`을 `cookies()`로 읽고 `/auth/me`로 검증한 뒤, 실패하면 `/login`으로 redirect합니다.

## 로그아웃 / 세션 만료 흐름

- 사이드바 좌하단 "로그아웃" 버튼이 logout 액션입니다. 클릭 시:
  1. 클라이언트가 `POST /api/v1/auth/logout`을 호출 (cookie credentials 자동 포함).
  2. 서버는 `extractToken(req)`로 cookie 또는 Authorization header에서 토큰을 꺼내 `sessionStore.revoke()`로 무효화하고, `Set-Cookie`로 `hanmir_token=; Max-Age=0` 응답.
  3. 클라이언트가 추가로 `clearSessionCookie()`를 호출해 `document.cookie`도 즉시 만료시킵니다 (응답 cookie 처리에 대한 브라우저 변종 대응).
  4. `router.replace("/login")` + `router.refresh()`로 로그인 화면 이동.
- 토큰은 `sessionStore`의 TTL(12시간)이 지나도 자동으로 만료됩니다.
- 클라이언트 write 액션(`MessageComposer`, `NoticeConfirmButton`)이 `ApiError(status === 401)`을 받으면 `handleSessionExpired(router)` 헬퍼로 cookie를 비우고 `/login`으로 보냅니다. 403은 권한 문제로 간주하여 redirect하지 않고 인라인 메시지만 표시합니다.

## Cookie 정책

- 현재 `hanmir_token`은 `SameSite=Lax`의 평문 쿠키이며 **httpOnly가 아닙니다**.
- 그 이유: 클라이언트 컴포넌트가 같은 쿠키를 `credentials: "include"`로 사용하는 동시에, 로그아웃 시 `document.cookie`로 즉시 만료할 수 있어야 하기 때문입니다 (MVP 단순화).
- 백엔드는 토큰 추출 시 헤더와 쿠키를 모두 받고 있으므로, 추후 백엔드가 로그인 시점에 `Set-Cookie: hanmir_token=...; HttpOnly; Secure; SameSite=Strict`로 쿠키를 발급하고 프론트는 직접 쿠키를 만지지 않는 구조로 전환할 수 있습니다 (TODO 참조).

## 관리자 CRUD API (admin / super_admin 전용)

### Users

- `GET /api/v1/users` — 인증 사용자 누구나 (멤버 lookup용)
- `GET /api/v1/users/:id` — 인증 사용자 누구나
- `POST /api/v1/users` — admin/super_admin only. Body: `CreateUserInput`. 충돌 시 `409 email_in_use`, 부서 미존재 시 `400 department_not_found`.
- `PATCH /api/v1/users/:id` — admin/super_admin only. Body: `UpdateUserInput` (부분 갱신).
- `PATCH /api/v1/users/:id/deactivate` — admin/super_admin only. `isActive = false`, `presence = "off"`로 표시.

### Departments

- `GET /api/v1/departments` — 인증 사용자 누구나 (활성 부서만 반환, `isActive !== false`).
- `POST /api/v1/departments` — admin/super_admin only. Body: `CreateDepartmentInput`.
- `PATCH /api/v1/departments/:id` — admin/super_admin only. Body: `UpdateDepartmentInput`.
- `DELETE /api/v1/departments/:id` — admin/super_admin only. 활성 사용자가 남아 있으면 `409 department_in_use`, 그렇지 않으면 hard delete (현재 MVP). 향후 soft delete로 전환 예정.

권한 검사는 `requireRole("admin", "super_admin")` 미들웨어로 라우트 단위 적용됩니다. 권한 없는 토큰은 `403 { error: "forbidden" }`, 무토큰은 `401 { error: "unauthorized" }`.

DTO 타입은 `packages/shared/src/types.ts`의 `CreateUserInput` / `UpdateUserInput` / `CreateDepartmentInput` / `UpdateDepartmentInput`을 참고하세요. 프론트 호출은 각각 `userService.{createUser,updateUser,deactivateUser}` 및 `departmentService.*`로 노출되어 있습니다.

### 관리자 UI에서 연결된 기능

`/admin` 페이지는 admin/super_admin만 접근 가능합니다 (다른 역할은 `/chat`으로 redirect). UI 연결 현황:

| 영역 | 동작 |
| --- | --- |
| 사용자 목록 + 검색 | 이름/이메일/부서로 필터링 |
| `+ 사용자 추가` | `userService.createUser` 호출. 이름·이메일·부서·직책·역할·아바타·이니셜·연락처 입력. 저장 후 목록 즉시 갱신 + `router.refresh()`. |
| 사용자 행의 `수정` | `userService.updateUser`. 같은 모달 재사용, 모든 필드 부분 갱신 가능. |
| 사용자 행의 `비활성화` | `userService.deactivateUser`. 비활성 사용자는 액션 비활성화. 상태 태그가 "활성 → 비활성"으로 즉시 전환. |
| 부서 관리 카드 | 인라인 `+ 부서 추가` 폼 + 부서 목록 (수정/삭제 액션) |
| 부서 `수정` | 모달로 부서명/설명 갱신 (`departmentService.updateDepartment`). |
| 부서 `삭제` | `departmentService.deleteDepartment`. 활성 사용자가 남아 있으면 백엔드가 `409 department_in_use` 반환 → UI는 "사용 중인 부서는 삭제할 수 없습니다…" 안내. |

오류 처리:
- 401 (세션 만료) → `handleSessionExpired(router)`가 cookie를 비우고 `/login`으로 redirect
- 403 (권한 없음) → 인라인 "권한이 없습니다." 메시지 (UI 상태로 표시, redirect 없음)
- 409 (`email_in_use` / `department_in_use`) → 사용자 친화 메시지로 변환
- 400 (`avatarTone_invalid` 등) → 입력값 표시

미구현 (TODO):
- 사용자 재활성화 액션 (현재 deactivate만)
- 부서 변경 시 소속 사용자 일괄 이동
- 사용자 초대 (이메일 발송) — 현재는 즉시 생성만

### Validation 정책 (users)

- `email`: trim 후 저장(케이스 보존). 중복 검사는 `findByEmail`에서 case-insensitive 비교. `POST`/`PATCH` 모두 다른 사용자와 충돌 시 `409 email_in_use`. `PATCH`로 본인 자신의 기존 이메일을 그대로 보내는 것은 허용.
- `avatarTone`: `default | orange | green | purple | gray` 화이트리스트 검증. 그 외 값은 `400 avatarTone_invalid`.
- `role`: `super_admin | admin | manager | project_owner | member` 화이트리스트.

## Projects / Tasks CRUD API

### Projects

- `GET /api/v1/projects` — 인증 사용자 누구나
- `GET /api/v1/projects/:id` — 인증 사용자 누구나
- `POST /api/v1/projects` — writer role (`admin` / `super_admin` / `manager` / `project_owner`)
- `PATCH /api/v1/projects/:id` — writer role
- `DELETE /api/v1/projects/:id` — writer role. **Soft delete**: `status = "cancelled"`로 마킹. 응답 `{ ok: true, project }`. 관련 tasks/messages는 그대로 유지.
- `POST /api/v1/projects/:id/members` — writer role. Body: `{ userId }`. 존재하지 않는 user는 `400 user_not_found`, 이미 멤버이면 idempotent (현재 멤버 목록 반환).
- `DELETE /api/v1/projects/:id/members/:userId` — writer role. idempotent.

### Tasks

- `GET /api/v1/projects/:projectId/tasks` — 인증 사용자 누구나
- `POST /api/v1/projects/:projectId/tasks` — writer role. Body: `CreateTaskInput`. 응답 `201` + 생성된 task.
- `GET /api/v1/tasks/:id` — 인증 사용자 누구나
- `PATCH /api/v1/tasks/:id` — writer role
- `DELETE /api/v1/tasks/:id` — writer role. Hard delete. 응답 `{ ok: true }`.

### 권한 정책 (projects/tasks)

| 역할 | read | write |
| --- | --- | --- |
| `super_admin`, `admin` | ✅ | ✅ |
| `manager`, `project_owner` | ✅ | ✅ (MVP: 글로벌 허용. TODO로 프로젝트별 owner/멤버 검사) |
| `member` | ✅ | 403 |

> 현재 MVP는 글로벌 role 기준. **per-project ownership/membership 검사는 TODO**: 향후 `req.currentUser.id`가 `project.memberIds`에 포함되거나 admin이어야 write 가능하도록 좁힐 예정. 코드 내 `TODO(per-project)` 마커 참조.

### `taskCounts` / `delayedCount` 자동 재계산

`MemoryTaskRepository.create/update/delete`가 호출되면 `recomputeProjectCounts()`로 해당 프로젝트의 `taskCounts.{done,inProgress,pending,total}` 및 `delayedCount`를 자동 재계산합니다.

- `done` ← `status === "done"`
- `inProgress` ← `status === "in_progress" | "review"`
- `pending` ← `status === "todo" | "on_hold"`
- `delayedCount` ← `dueState === "late"`

> Postgres adapter는 매 `Project` 조회 시 `tasks` 상태 집계 서브쿼리로 `taskCounts.{done,inProgress,pending,total}`과 `delayedCount`(`due_date < CURRENT_DATE AND status != 'done'`)를 fresh 계산합니다. memory처럼 task CUD 시 미리 캐시해 두는 것이 아니라 매 read에서 다시 집계하므로, write 후 별도 동기화가 필요 없습니다. `Project.progress` 자동 계산(태스크 progress 평균/가중치)은 정책 결정 후 도입.

### DTO

`packages/shared/src/types.ts`:

- `CreateProjectInput`, `UpdateProjectInput`, `ProjectMemberInput`
- `CreateTaskInput`, `UpdateTaskInput`

프론트 service:

- `projectService.{createProject, updateProject, deleteProject, addProjectMember, removeProjectMember}`
- `taskService.{createTask, getTask, updateTask, deleteTask}` (기존 `listByProject` 유지)

> **UI 연결 상태**: 위 service 함수들은 정의되어 있으나 페이지에서 호출하는 폼/버튼이 아직 없습니다. 현재 `/projects`, `/projects/[id]`, `/projects/[id]/tasks`, `/projects/[id]/gantt`는 전부 read-only이고 `+ 업무 추가` 같은 버튼은 핸들러 없는 스텁입니다. UI 연결은 다음 작업 단계로 남아 있습니다.

## TODO

- `hanmir_token` 쿠키를 **httpOnly + Secure + SameSite=Strict**로 전환하고, 로그인 응답에서 `Set-Cookie`로 발급. 프론트는 더 이상 `document.cookie`를 만지지 않도록 정리.
- Refresh token / JWT 정식화 (`POST /auth/refresh`) — access token TTL을 짧게 가져가고 refresh token으로 갱신.
- 비밀번호 해시(bcrypt/argon2) 도입, 단일 `DEFAULT_PASSWORD` 제거.
- 세션 저장소를 in-memory에서 Redis 등 외부 저장소로 이전 (다중 워커/재시작 대비).
- 401 발생 시 client 공통 fetch wrapper에서 자동 처리 (개별 컴포넌트마다 `handleSessionExpired` 호출하지 않도록).
- 추가 권한 분리: `manager` / `project_owner` 전용 가드 (`PATCH /projects/:id`, `POST /messages/:messageId/create-task` 등).
- `GET /users` 권한 정책 재검토 (전사 디렉토리 vs admin-only).
- `notices` 사용자별 확인 상태: **인터페이스/어댑터 구현 완료** (memory `confirmedByUser` Map + postgres `notice_reads` upsert). 다만 실제 Postgres DB에서 `notice_reads` 행이 기대대로 쌓이는지에 대한 end-to-end smoke는 미수행 (아래 "Postgres smoke 상태" 참고).
- 나머지 write API 구현 + 보호 (docs/08의 decisions, files 업로드, notices write, messages search 등). projects/tasks/users/departments는 1차 구현 완료.
- projects/tasks write에 **per-project ownership/membership 검사** 적용 (`TODO(per-project)` 마커). 현재는 글로벌 role만 검사.
- WebSocket events 구현 (`message:new`, `notice:new`, `task:assigned`).
- **Postgres adapter 후속 컬럼/테이블**: 현재 default로 채우는 항목을 본격 영속화하려면 다음 컬럼/테이블 도입 필요.
  - `room_members.last_read_message_id` 기반 사용자별 `unread` 계산
  - `messages.pinned` 또는 `room_pinned_messages` 테이블 (현재 `getPinned`은 undefined 반환)
  - `notices.tone` 컬럼 또는 별도 상태 모델 (현재 `is_required`에서 파생)
  - `product_documents` / `product_lots` / `product_quarter_metrics` (제품 상세의 빈 섹션 채우기)
  - `file_folders` (파일함 폴더 그리드)
  - `task_assignees` (다중 담당자)
- Departments **soft delete** (`is_active = false`) 도입 — 현재 MVP는 in-use 체크 후 hard delete.
- `projects.sales_status` 컬럼 default를 한국어 `'준비중'`에서 enum 값 `'preparing'`으로 맞추는 마이그레이션. 현재는 어댑터가 INSERT에 `'preparing'`을 명시해 회피 중.
- 사용자 비밀번호 발급/초기화 흐름 — `POST /users`가 받는 `password`는 현재 무시되고 모든 시드 사용자가 `DEFAULT_PASSWORD`로 로그인.
- 관리자 UI 1차 연결 완료 (사용자 생성/수정/비활성화 + 부서 CRUD). 후속: 재활성화 액션, 사용자 일괄 부서 변경, 이메일 초대 흐름, 채팅방/공지 등 관리자 영역 확장.
- 감사 로그 영속화 / 사용자 변경/비활성화 시 audit row 발급.
