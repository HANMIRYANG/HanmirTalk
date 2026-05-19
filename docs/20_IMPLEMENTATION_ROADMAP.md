# 20. 한미르톡 — spec 100% 도달 단계별 구현 로드맵

> 작성일: 2026-05-18
> 출처: `docs/00`~`docs/19` 통합 정독 + 현재 구현 상태 audit 결과
> 목적: 남은 작업을 **의존성 충돌 없는 순서**로 정리하고, 각 단계별 체크리스트로 완료 여부를 추적

---

## A. 한 페이지 요약

- **현재 위치**: MVP-1 (회사 내부 시범 가능 골격) — 약 50~60% 완료
- **남은 작업**: 11개 phase (Phase 0~10), 약 4~6주 1인 풀타임 분량
- **이 문서의 사용법**: 작업 완료 시 해당 phase의 체크박스 ✅ 처리 → commit message에 `[Phase N]` 태그 사용
- **선행조건 원칙**: schema 변경이 필요한 작업이 같은 컬럼/테이블을 건드리는 다른 작업보다 먼저 와야 함. 보안 코어는 외부 배포 전 끝나야 함.

---

## B. 도큐(00~19) ↔ 현재 구현 매트릭스

| Doc | 핵심 요구사항 | 상태 | 미구현 항목 (이 문서의 Phase로 매핑) |
| --- | --- | --- | --- |
| 00 PROJECT_OVERVIEW | 사내 통합 업무 허브 | ✅ 골격 완료 | — |
| 01 PRD | 직급별 맞춤 UX, 한국어 단순 용어 | ✅ 골격 완료 | — |
| 02 MVP_SCOPE | 8개 핵심 기능군 | ⚠️ 약 65% | 메시지 검색·멘션·모바일 푸시 → Phase 5/6/9 |
| 03 FEATURE_SPEC | + 결정사항·멘션·AI 명령 | ⚠️ 약 55% | 결정사항·멘션·/AI → Phase 3/5 |
| 04 PROJECT_MANAGEMENT | 8역할·상태머신·간트 | ✅ 거의 다 | per-project ownership 검사 → Phase 1 |
| 05 MESSENGER_SPEC | 7타입 메시지·검색·고정·멘션·AI·entities | ⚠️ 약 50% | 메시지 CRUD 확장·entities·AI → Phase 2/5 |
| 06 PRODUCT_INFO_SPEC | 제품+영업5단계+8종 문서 분류 | ⚠️ 약 50% | LOT·시험성적서·문서 분류·이력 → Phase 7 |
| 07 DB_SCHEMA | 14개 테이블 | ⚠️ 약 80% | decisions·product_specs·product_lots·sales_status_events·user_notifications·audit_logs → Phase 1/3/6/7/8 |
| 08 API_SPEC | 약 60개 endpoint | ⚠️ 약 60% | refresh·메시지검색/수정/삭제·decisions·AI·검색 → Phase 1/2/3/5/9 |
| 09 EXTERNAL_API | Redis·Web Push·SMTP·LLM·Drive·Calendar | ❌ 약 5% | Postgres·WebSocket만 됨. 나머지 전부 → Phase 1/6/5 |
| 10 AUTH_PERMISSION | bcrypt·JWT refresh·첫 로그인 강제 변경·감사로그 | ⚠️ 약 35% | → Phase 1 |
| 11 NOTIFICATION | 웹/브라우저/PWA 알림+채널 설정 | ❌ 약 10% | → Phase 6 |
| 12 FILE_UPLOAD | 화이트리스트·MIME·signed URL·50MB | ⚠️ 약 40% | → Phase 1 |
| 13 PWA_MOBILE | manifest·SW·홈 설치 | ❌ 약 5% | → Phase 0 |
| 14 SECURITY | bcrypt·refresh rotation·감사로그·HTTPS | ⚠️ 약 30% | → Phase 1 |
| 15 DEVELOPMENT_PHASES | Phase 1~7 | ✅ 1~5 거의, 6 절반, 7 부분 | — |
| 16 CLAUDE_CODE_INSTRUCTIONS | 작업 방식 | ✅ N/A | NestJS 권장 → 실제 Express. 문서를 코드에 맞춤 |
| 17 CODEX_REVIEW_CHECKLIST | 검토 체크리스트 | ✅ N/A | — |
| 18 PROJECT_STRUCTURE | 폴더 구조 | ✅ 일치 | — |
| 19 UI_FUNCTIONAL_AUDIT | UI 비동작 60개 | ⚠️ 진행 중 | Group A~G → Phase 0/4/5/6/7/8/10 |

---

## C. Phase 0 — 즉시 (백엔드 무변경, 사용자 체감 큼)

**의존성**: 없음. 다른 phase와 병행 가능.
**예상 작업량**: 1~2일

### C-1. UI 토글/필터/검색 (doc/19 Group A)

- [x] `apps/web/src/app/(app)/projects/[id]/tasks/page.tsx` — 보드/타임라인/표 뷰 토글 (TasksWorkspace 클라이언트 컴포넌트)
- [x] 같은 페이지 — 담당자/상태/우선순위/정렬 필터 드롭다운
- [x] 같은 페이지 — 업무 검색 input (`useState` + 클라이언트 필터)
- [x] 같은 페이지 — 완료 그룹 접기/펼치기
- [x] `apps/web/src/app/(app)/projects/[id]/gantt/page.tsx` — 일/주/월/분기 타임스케일 (GanttToolbar)
- [x] 같은 페이지 — 기간/담당자/상태 필터 + PDF 내보내기(window.print) + 일정 추가(TaskCreateButton 재사용)
- [x] `apps/web/src/app/(app)/files/page.tsx` — 좌측 사이드바 scope 필터 (전체/최근/즐겨찾기/내가 공유/개인 보관함/프로젝트별/부서별/유형별) (FileLibrary)
- [x] 같은 페이지 — 목록/카드/상세 뷰 토글
- [x] 같은 페이지 — 유형/소유자/기간/정렬 필터
- [x] 같은 페이지 — 파일 검색 input
- [x] `apps/web/src/components/chat/ChatList.tsx` — 전체/읽지 않음/고정/멘션 pill 필터링 (멘션은 Phase 5 후 동작)

### C-2. 데이터 바인딩 정리 (doc/19 Group F)

- [x] **`Topbar.tsx` 하드코딩 "김민준 / 생산기술팀 · 책임"** → `authService.tryGetMe()` 비동기 호출로 실제 사용자 표시
- [x] 같은 곳 — 알림 dot → 확인 필요한 필독 공지 개수에 따라 표시/숨김
- [x] `/chat/page.tsx` 상단 요약 카드의 하드코딩 숫자 (12, 3, 5, 2 등) 모두 실 데이터 바인딩 (rooms.unread, projects.length 등)
- [x] `/files` 사이드바 카운트 — FileLibrary가 실제 files 배열로 scope별 카운트 계산

### C-3. PWA 기본 (doc/13)

- [x] `apps/web/public/manifest.webmanifest` start_url을 `/dashboard`로 갱신, orientation을 `any`로 (이미 다른 필드 존재)
- [x] 로고는 기존 `apps/web/public/assets/hanmir-logo.png` 재사용 (manifest icons)
- [x] `apps/web/src/app/layout.tsx` — manifest, theme-color, appleWebApp 메타 이미 존재 ✓
- [x] `apps/web/public/sw.js` — network-first nav + cache-first static, /api·socket.io·/download 캐시 제외
- [x] `apps/web/src/components/shell/PwaRegister.tsx` — 인증 셸에서 SW 등록 (HTTPS 또는 localhost 한정)
- [x] 로그인 유지 동작 — cookie 기반이라 자연 동작

### C-4. README 갱신

- [x] `README.md` 기능 구현 현황 요약 — Phase 0 항목 ✅로 갱신 (별도 commit)

---

## D. Phase 1 — 보안 코어 (운영 배포 전 필수)

**의존성**: 다른 phase와 독립적. 단, Phase 2/3/5/6/7 보다 먼저 끝내는 게 권장.
**예상 작업량**: 4~6일 (SMTP 포함)
**진행 상황 (2026-05-19 기준)**: D-1, D-2, D-3, D-4(부분), D-5, D-6, D-7(SMTP), D-8 ✅
**남은 작업 (실행 순서)**: **D-4 sweep (확장 10건) → D-9 (문서 drift 정리)**

> **2026-05-19 추가 결정**: codex 추가 검수에서 발견된 채팅방 권한 결함이 D-3보다 먼저 차단되어야 함이 확인됨. 또한 D-4 audit hook이 사용자/부서 외에도 task/product/notice/file 등에 누락되어 sweep 범위가 확장됨. D-9는 SMTP 도입 후 발견된 .env/docker-compose 문서 drift 정리.

### D-1. 비밀번호 해시 (doc/10, 14) ✅

- [x] `server` 의존성 추가 — `bcryptjs` (pure JS, Windows 네이티브 빌드 회피)
- [x] `users.password_hash` 컬럼은 이미 NOT NULL — 시드 데이터 마이그레이션 적용
- [x] **마이그레이션 006_users_bcrypt_password.sql** — 기존 `'pending-bcrypt-migration'` placeholder를 시드 사용자에 대해 bcrypt('hanmir1234')로 일괄 교체 (idempotent)
- [x] `server/src/auth/password.ts` — hashPassword / verifyPassword / seedPasswordHash 헬퍼
- [x] `UserRepository.verifyPassword / setPassword` 인터페이스 + 메모리·PG 어댑터 구현
- [x] `server/src/routes/auth.ts` — `repos.users.verifyPassword(user.id, password)` 로 검증. 비활성 계정은 401 `account_inactive`
- [x] `server/src/routes/users.ts` — `POST /users` 가 `input.password` 있으면 bcrypt hash, 없으면 seed hash 사용

### D-2. 첫 로그인 강제 비밀번호 변경 (doc/10) ✅

- [x] **마이그레이션 007_users_must_change_password.sql** — `users.must_change_password BOOLEAN NOT NULL DEFAULT false`. 시드 사용자에 true 설정 (idempotent)
- [x] shared.User에 `mustChangePassword?: boolean` 추가, 양 어댑터 rowToUser/속성에 반영
- [x] `POST /auth/change-password` 신규 — currentPassword + newPassword 검증, 8자 미만/동일/잘못된 current 시 400/401. 성공 시 `must_change_password=false`
- [x] 프론트 `apps/web/src/components/shell/PasswordChangeGuard.tsx` — client 가드로 `/account/password` 외 경로 차단
- [x] `/account/password` 페이지 + `ChangePasswordForm` client component
- [x] 메모리 모드 시드는 dev 편의상 `mustChangePassword=false` 유지

### D-3. httpOnly + Secure 쿠키 + Refresh Token (doc/10, 14) ✅

- [x] **마이그레이션 008_refresh_tokens.sql** — `refresh_tokens(id, user_id, token_hash CHAR(64), expires_at, revoked_at, user_agent, ip, created_at)` + user_id·expires_at 인덱스. 토큰은 sha256 hex digest로만 저장 (raw 토큰은 issue 시점에만 반환)
- [x] `auth/token.ts` — `setAuthCookies(res, {access, refresh, ...})` / `clearAuthCookies(res)` 헬퍼. `hanmir_token` HttpOnly+SameSite=Strict+Max-Age=900, `hanmir_refresh` HttpOnly+SameSite=Strict+Path=/api/v1/auth+Max-Age=2592000. CORS_ORIGIN이 https://이면 Secure 자동 추가
- [x] `POST /auth/login` — sessionStore.issue + refreshTokens.issue → setAuthCookies. Body의 `token` 필드는 backward compat용 유지
- [x] `POST /auth/refresh` — refresh cookie 검증 → rotation (구 row revoke + 신 row issue) + 신 access pair → setAuthCookies
- [x] `POST /auth/logout` — access sessionStore.revoke + refresh row revoke + clearAuthCookies
- [x] `POST /auth/change-password` — 성공 시 본인의 모든 refresh 토큰 revoke (탈취 대응)
- [x] `RefreshTokenRepository` 인터페이스 + 메모리·PG 어댑터 (PG는 sha256 hex로 lookup)
- [x] 프론트 `LoginForm.tsx` — `document.cookie` 직접 set 제거. 서버 Set-Cookie에 의존
- [x] 프론트 `api-client.ts` — 401 시 single-flight `/auth/refresh` 시도 후 자동 재시도 1회. `/auth/refresh` 자체와 `/auth/login`은 재시도 제외
- [x] 프론트 `client-auth.ts` — `clearSessionCookie` → `clearSession()` (httpOnly라 JS clear 불가, server logout 호출)
- [x] `Sidebar.tsx` 로그아웃 — `authService.logout()` 호출만 (cookie clear는 서버가)
- [x] socket.io 핸드셰이크 — `tokenFromHandshake()`로 httpOnly cookie를 우선 읽고, fallback으로 auth.token / Authorization 헤더 (script/test 호환)

### D-4. 감사 로그 영속화 (doc/14) ✅

- [x] **마이그레이션 009_audit_logs.sql** — `audit_logs(id, actor_user_id, actor_name, actor_role, action, target_type, target_id, target_label, ip, level, meta JSONB, created_at)` + created_at·actor·action 인덱스
- [x] `server/src/audit.ts` — `auditLog(repos, req, input)` 헬퍼 (failure 시 silent log)
- [x] `AuditRepository.record / list` 인터페이스 + 메모리·PG 어댑터 구현
- [x] 사용자 CRUD: create / update / deactivate 모두 hook
- [x] 부서 CUD: create / update / delete hook
- [x] 프로젝트 CUD: create / cancel hook (member add/remove는 추후)
- [ ] **후속 sweep으로 일괄 처리 → 별도 항목 D-4 sweep 참고**
- [x] `GET /api/v1/dashboard/audit` 라우트 — seed → audit_logs.list 교체, admin only
- [x] `/admin` 페이지의 감사 로그 카드는 같은 endpoint를 그대로 사용 (UI 변경 없음, 데이터 소스만 교체)

#### D-4 sweep (확장 범위, 후속 작업)

원래 로드맵에서는 "공지 / 결정사항 / 파일 삭제 / 관리자 로그인"만 명시했으나, 2026-05-19 검수에서 다음 항목들도 audit hook이 없음을 확인:

- [ ] `project.update` (`server/src/routes/projects.ts:269`)
- [ ] `project.member.add / remove`
- [ ] `task.create / update / delete` (routes/tasks.ts에 audit import 자체 없음)
- [ ] `product.create / update / delete` (routes/products.ts에 audit import 자체 없음)
- [ ] `notice.create` (routes/notices.ts에 audit import 자체 없음)
- [ ] `file.delete` + `file.upload` (선택)
- [ ] `auth.login.success / failure` (관리자 로그인 한정)
- [ ] `auth.password.change` (본인이 비밀번호 변경 시)

### D-5. per-project ownership 검사 (doc/04) ✅

- [x] `ensureProjectAccess()` 헬퍼 — admin/super_admin은 패스, 그 외는 memberIds 검사
- [x] `projects.ts` PATCH/DELETE, member add/remove, task POST 모두 적용
- [x] `ensureTaskProjectAccess()` 헬퍼 — task의 parent project 멤버십 검사
- [x] `tasks.ts` PATCH/DELETE에 적용
- [x] `// TODO(per-project)` 마커 제거

### D-6. 파일 업로드 보안 (doc/12) ✅

- [x] `server/src/routes/files.ts` 허용 확장자 화이트리스트: jpg/png/webp/gif/pdf/doc/docx/hwp/hwpx/xls/xlsx/csv/ppt/pptx/zip
- [x] 차단 확장자 명시 거부: exe/bat/cmd/scr/msi/ps1/vbs/jar/sh/html/svg 등
- [x] `file.mimetype` MIME prefix 검사 (image/, application/pdf 등)
- [x] `UPLOAD_MAX_BYTES` 기본값 25MB → **50MB** (spec 일치)
- [x] `uploadErrorHandler` 미들웨어로 multer 거절을 415/413 응답으로 깔끔하게 변환
- [ ] (선택) signed URL — 현재 cookie 인증으로 충분, 미적용

### D-7. SMTP 도입 (Phase 1·8용) ✅

- [x] `nodemailer` + `@types/nodemailer` 설치
- [x] `server/src/mailer.ts` — `sendMail({to, subject, text?, html?})` 래퍼, 실패 silent
- [x] `verifyMailer()` 부팅 시 SMTP 도달성 체크 (실패는 경고 로그만, 부팅 안 막음)
- [x] `config.ts` SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE / SMTP_FROM / SMTP_ENABLED 환경변수
- [x] `docker-compose.yml`에 mailhog 서비스 추가 (포트 1025 SMTP + 8025 Web UI)
- [x] `.env.example`에 SMTP 블록 + mailhog 사용법 안내
- [x] 부트 smoke: `[hanmir-server] mailer: SMTP ready at localhost:1025` 확인
- [ ] 실제 `sendMail` 호출은 Phase 8 초대 흐름에서 처음 활성화

### D-8. 채팅방 멤버십 권한 검사 (긴급, 2026-05-19 추가) ✅

> **0순위 — D-3보다 먼저.** 인증된 사용자가 roomId만 알면 비멤버 방에서도 메시지 전송/조회/고정/읽음 표시가 가능한 인가(authorization) 결함. 시범 사용자 확대 전 필수 차단.

**근본 원인**: `routes/rooms.ts`의 read/pin/unpin/messages POST/read marker가 멤버십 검증 없이 `repos.rooms.findById(req.params.roomId)`만 사용. PG `ROOM_SELECT` (postgres.ts:778)에도 `room_members` 필터 없음. 특히 `markRead`의 `INSERT ... ON CONFLICT DO UPDATE` (postgres.ts:963)는 호출만으로 호출자를 그 방 멤버로 만들 수 있어 권한 상승 가능.

- [x] `server/src/routes/rooms.ts` — `ensureRoomAccess(repos, req, res, roomId)` 헬퍼 추가 (admin/super_admin 패스, 그 외 `room.members`에 본인 포함 확인, 비멤버는 404로 위장)
- [x] 적용 라우트: `GET /:id`, `GET /:roomId/messages`, `GET /:roomId/pinned`, `POST /:roomId/read`, `POST /:roomId/pin`, `DELETE /:roomId/pin`, `POST /:roomId/messages`
- [x] `GET /rooms` (목록) — admin 외에는 본인이 멤버인 방만 반환 (라우트 레이어에서 필터)
- [x] `PgMessageRepository.markRead` — `INSERT ... ON CONFLICT` 대신 `UPDATE room_members ... WHERE` 로 변경. 비멤버에게 멤버십 부여 차단
- [x] socket.io `room:join` 이벤트 (`realtime.ts`) — `canAccessRoom()` 멤버십 검증 추가, 비멤버는 silent join 거부 (`realtime.attach()`에 `repos` 주입)

### D-9. 문서 drift 정리 (2026-05-19 추가) ❌

- [ ] `.env.example` `UPLOAD_MAX_BYTES` 주석 "25 MB" → "50 MB" (D-6에서 코드만 갱신됨)
- [ ] `.env.example` `DEFAULT_PASSWORD` "bcrypt 도입 전까지의 임시 값" 문구 제거 (D-1 완료)
- [ ] `docker-compose.yml` 마이그레이션 안내 "001 → 002 → 003" → "001~009 (alphabetical 순서)"
- [ ] `docs/16_CLAUDE_CODE_INSTRUCTIONS.md` NestJS 권장 → Express 실태에 맞춰 갱신 (선택)

---

## E. Phase 2 — 메시지 보완 (doc/05, 08)

**의존성**: 마이그레이션 010 (messages 확장). Phase 1과 병행 가능.
**예상 작업량**: 2~3일

### E-1. 메시지 수정·삭제 API

- [ ] **마이그레이션 010_messages_extension.sql** — 이미 `messages.is_deleted` 컬럼 존재. `messages.edited_at TIMESTAMP NULL` 추가
- [ ] `PATCH /messages/:id` — 본인이 작성한 메시지만, body 수정, `edited_at = NOW()`
- [ ] `DELETE /messages/:id` — `is_deleted = true` (soft). 본인 또는 admin
- [ ] 메시지 list 응답에 `editedAt`, `isDeleted` 필드 추가 — 삭제된 메시지는 body를 "삭제된 메시지입니다"로 마스킹

### E-2. 프론트 UI

- [ ] `MessageItem.tsx` 에 hover 메뉴 (`수정`, `삭제`) 추가 — 본인 작성 메시지만
- [ ] 인라인 편집 UI (textarea 모드) + 저장/취소
- [ ] 삭제 시 confirm + `chatService.deleteMessage(id)`

### E-3. 메시지 검색 (doc/05, 08)

- [ ] **마이그레이션 011_messages_fts.sql** — `messages.content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED` + `CREATE INDEX messages_content_tsv_idx ON messages USING GIN (content_tsv)`
- [ ] (한국어 검색을 위해 simple 사용; pg_trgm fallback 또는 추후 nori 도입)
- [ ] `GET /messages/search?q=&roomId=` — 사용자가 접근 가능한 방 한정. body LIKE/FTS 매칭
- [ ] `chatService.searchMessages(q, opts)`
- [ ] Topbar 검색 form 강화 — `/search?q=` 라우트 신설 (메시지/파일/프로젝트 통합)

---

## F. Phase 3 — 결정사항 (decisions) (doc/03, 05, 07, 08)

**의존성**: 마이그레이션 012. Phase 1 audit 영속화 완료 권장 (decisions CUD 도 audit).
**예상 작업량**: 2일

### F-1. 백엔드

- [ ] **마이그레이션 012_decisions.sql** — `decisions(id, project_id NOT NULL FK, title NOT NULL, content NOT NULL, decided_by NOT NULL FK users, decision_date DATE NOT NULL, source_message_id UUID FK messages NULL, created_at, updated_at)`
- [ ] shared types: `Decision`, `CreateDecisionInput`, `UpdateDecisionInput`
- [ ] `DecisionRepository` 인터페이스 + memory + postgres adapter
- [ ] Routes:
  - [ ] `GET /api/v1/projects/:projectId/decisions`
  - [ ] `POST /api/v1/projects/:projectId/decisions` — writer role
  - [ ] `GET /api/v1/decisions/:id`
  - [ ] `PATCH /api/v1/decisions/:id` — writer or decided_by
  - [ ] `DELETE /api/v1/decisions/:id` — admin or decided_by (soft)
  - [ ] `POST /api/v1/messages/:messageId/create-decision` — 채팅에서 결정사항 만들기 (writer)

### F-2. 프론트

- [ ] `apps/web/src/services/decision.service.ts`
- [ ] `/projects/[id]/decisions/page.tsx` 신설
- [ ] `ProjectHeader.tsx` 의 `결정 기록` 탭 — href를 새 라우트로
- [ ] 결정 작성 모달 (writer)
- [ ] 인라인 편집 / 삭제
- [ ] `MessageItem.tsx` 에 hover 메뉴 `결정사항으로 만들기` (writer) — 미리보기 모달 → 확정

---

## G. Phase 4 — 채팅방 운영 (doc/05, 08, doc/19 Group B)

**의존성**: Phase 1 보안. 메시지 mute 는 schema 변경 없음 (`room_members.notification_enabled` 컬럼이 이미 있음).
**예상 작업량**: 2~3일

### G-1. 백엔드

- [ ] `POST /api/v1/rooms` — `{name, type, projectId?, memberIds[]}`. 생성자 자동 멤버.
- [ ] `PATCH /api/v1/rooms/:id` — name, description 수정
- [ ] `POST /api/v1/rooms/:id/members` — `{userId}` (현재 프로젝트 멤버에만 있는 패턴을 rooms 에도 적용)
- [ ] `DELETE /api/v1/rooms/:id/members/:userId`
- [ ] `POST /api/v1/rooms/:id/mute` — `room_members.notification_enabled = false`
- [ ] `DELETE /api/v1/rooms/:id/mute` — `notification_enabled = true`
- [ ] `POST /api/v1/rooms/:id/leave` — 본인 `room_members` 행 삭제. 마지막 멤버일 경우 방 비활성 (`is_active = false`)
- [ ] `POST /api/v1/rooms/direct` — `{userId}` 두 사람의 DM 방을 찾거나 없으면 생성. 멱등.

### G-2. 프론트

- [ ] `ChatList.tsx` `+ 새 채팅` IconButton 활성화 — 모달:
  - [ ] type 선택 (direct / group / project)
  - [ ] 멤버 선택 (사용자 검색)
  - [ ] 방 이름 (group)
  - [ ] 생성 → `/chat/[newId]` 라우팅
- [ ] `/chat/[roomId]/page.tsx` 헤더 `멤버` IconButton — RoomInfoPane 토글 또는 멤버 모달
- [ ] 같은 곳 `더보기` IconButton — popover 메뉴: 음소거, 방 나가기, 채팅방 설정
- [ ] DM 시작 — `/products/[id]` 의 `1:1 대화 시작` 버튼에서 `chatService.openDirectMessage(userId)` 호출
- [ ] `chatService.muteRoom(id) / unmute / leaveRoom / createRoom / openDirectMessage`

### G-3. ChatList 필터링

- [ ] `읽지 않음` pill — `rooms.filter(r => r.unread > 0)`
- [ ] `고정` pill — `r.pinned`
- [ ] `멘션` pill — Phase 5 멘션 완료 후 — 본인 멘션된 메시지가 있는 방

---

## H. Phase 5 — 멘션 + AI 명령 (doc/03, 05, 09)

**의존성**: 마이그레이션 013 (messages.entities·ai_generated). 외부 LLM 키 (`ANTHROPIC_API_KEY`).
**예상 작업량**: 4~6일

### H-1. 메시지 entities (멘션 토큰)

- [ ] **마이그레이션 013_messages_entities.sql** — `messages.entities JSONB NOT NULL DEFAULT '[]'::jsonb`, `messages.ai_generated BOOLEAN NOT NULL DEFAULT false`, `messages.ai_command VARCHAR(40) NULL`, `messages.source_message_ids UUID[] NULL`
- [ ] shared types `MessageEntity = { type: "mention" | "project_ref" | "task_ref" | "file_ref"; id: string; label: string; offset: number; length: number }`
- [ ] `POST /api/v1/rooms/:id/messages` — body 에 `entities[]` 받아 저장
- [ ] `GET /api/v1/mentions/search?q=&scope=` — 사용자/부서/프로젝트/업무/파일 검색. 권한 필터링 (caller 가 접근 가능한 것만)

### H-2. 멘션 UI

- [ ] `MessageComposer.tsx` — `@` 입력 시 popover 열기. 검색 결과 클릭 → `entities` 배열에 추가, 본문 텍스트엔 `@한미준` 형태
- [ ] `MessageItem.tsx` — entities 의 mention 토큰을 `MentionPill` 로 렌더 + 클릭 시 사용자 프로필 (간단한 popover)

### H-3. 멘션 알림 (Phase 6 와 연동)

- [ ] 메시지 append 시 entities 에 사용자 mention 있으면 `notifications` 테이블에 row 추가 + socket emit

### H-4. AI 명령 — 백엔드 LLM 어댑터 (doc/09)

- [ ] `server` 의존성 추가 — `@anthropic-ai/sdk`
- [ ] 환경변수 — `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`)
- [ ] `server/src/ai/anthropic.ts` — `summarize / extractTasks / extractDecisions / draftNotice / minutes` 5개 함수. 모든 함수는 caller 가 접근 가능한 context (메시지 목록) 만 받음
- [ ] Routes:
  - [ ] `POST /api/v1/ai/chat-summary` — `{roomId, scope: "recent20" | "today" | "thread" | "messageIds"}`
  - [ ] `POST /api/v1/ai/extract-tasks` — 동일 scope. **자동 insert 금지** — preview 만 반환
  - [ ] `POST /api/v1/ai/extract-decisions`
  - [ ] `POST /api/v1/ai/draft-notice`
  - [ ] `POST /api/v1/ai/minutes`
- [ ] rate limit (사용자당 분당 5건, 일당 30건). 비용 한도 환경변수 — `AI_DAILY_TOKEN_LIMIT`
- [ ] 모든 AI 호출 audit log 기록

### H-5. /명령 UI

- [ ] `MessageComposer.tsx` — `/` 입력 시 popover 명령 리스트 (`/요약`, `/업무추출`, `/결정사항`, `/공지초안`, `/회의록`)
- [ ] 명령 선택 → scope 선택 모달 → AI 호출 → 미리보기 모달 (편집 가능)
- [ ] 미리보기에서 `삽입` 또는 `전송` 클릭 시 메시지 append (`ai_generated=true`, `ai_command=...`)
- [ ] 메시지 UI에 "AI 생성 초안" 뱃지 (ai_generated)
- [ ] **자동 전송 금지** — 명시 확정 클릭 필수

---

## I. Phase 6 — 알림 시스템 (doc/11)

**의존성**: 마이그레이션 014. Phase 5 멘션 완료 후 연동.
**예상 작업량**: 3~5일

### I-1. 알림 모델

- [ ] **마이그레이션 014_notifications.sql** — 
  ```
  user_notifications (
    id, user_id NOT NULL FK, kind VARCHAR(40) NOT NULL,
    title TEXT NOT NULL, body TEXT, link TEXT,
    payload JSONB, read_at TIMESTAMP NULL, created_at NOT NULL
  )
  user_notification_settings (
    id, user_id NOT NULL UNIQUE FK, all_enabled BOOLEAN DEFAULT true,
    per_room JSONB DEFAULT '{}'::jsonb, per_project JSONB DEFAULT '{}'::jsonb,
    web_push_enabled BOOLEAN DEFAULT false, browser_enabled BOOLEAN DEFAULT true
  )
  ```
- [ ] shared types `Notification`, `NotificationSettings`

### I-2. 알림 생성 hook

- 다음 행위에 알림 생성:
  - [ ] 메시지 append → 같은 방의 모든 멤버 (본인 제외) — kind `message:new`
  - [ ] 공지 생성 → 모든 활성 사용자 (본인 제외) — kind `notice:new`
  - [ ] 업무 배정 (task assigneeIds 변경) → 새 assignee — kind `task:assigned`
  - [ ] 마감 임박 — cron으로 dueDate-1d, dueDate 발송 (도입 시점에 별도)
  - [ ] 프로젝트 상태 변경 → 멤버 — kind `project:updated`
  - [ ] 멘션 (Phase 5) → entities 의 사용자 — kind `mention`
  - [ ] 결정사항 등록 (Phase 3) → 프로젝트 멤버 — kind `decision:new`
- 각 알림은 DB insert + socket emit (`notification:new`)

### I-3. 백엔드 API

- [ ] `GET /api/v1/notifications?unread=true&limit=20` — 본인 알림 inbox
- [ ] `POST /api/v1/notifications/:id/read`
- [ ] `POST /api/v1/notifications/read-all`
- [ ] `GET /api/v1/notification-settings` — 본인 설정 조회
- [ ] `PATCH /api/v1/notification-settings` — 설정 변경

### I-4. 프론트 UI

- [ ] Topbar `BellIcon` → popover 알림 inbox (최근 20개, 읽지 않음 우선)
- [ ] 알림 클릭 → `link` 라우팅 + read mark
- [ ] `/account/notifications` 페이지 — 전체/채팅방별/프로젝트별 토글
- [ ] 브라우저 Notification API — 사용자 권한 요청 + permission granted 시 `notification:new` 수신 시 `new Notification(title)` 호출

### I-5. Web Push (PWA 푸시)

- [ ] `apps/web/public/sw.js` — push event 리스너 추가
- [ ] `web-push` 라이브러리 + VAPID 키 (환경변수)
- [ ] `POST /api/v1/push-subscriptions` — 브라우저 subscription 등록
- [ ] 알림 생성 시 → 등록된 subscription 에 web-push 발송
- [ ] 알림 설정에서 푸시 활성화 토글

---

## J. Phase 7 — 제품 부속 (doc/06, doc/19 Group C)

**의존성**: 마이그레이션 015. Phase 1 audit hook 적용.
**예상 작업량**: 3~5일

### J-1. 스키마

- [ ] **마이그레이션 015_product_subsystems.sql**:
  - `product_specs (id, product_id NOT NULL FK, key TEXT NOT NULL, value TEXT NOT NULL, sort_order INT, UNIQUE(product_id, key))`
  - `product_lots (id, product_id NOT NULL FK, lot_no TEXT NOT NULL, produced_at DATE, quantity_kg NUMERIC, verdict VARCHAR(20), tested_at DATE, notes TEXT, UNIQUE(product_id, lot_no))`
  - `sales_status_events (id, product_id NOT NULL FK, from_status VARCHAR(40), to_status VARCHAR(40) NOT NULL, reason TEXT, changed_by NOT NULL FK users, changed_at TIMESTAMP NOT NULL DEFAULT NOW())`
  - 기존 `product_documents` 활용 — `document_type` 컬럼 enum화 (catalog, test_report, proposal, price_sheet, install_guide, faq, certificate, image)

### J-2. 백엔드 API

- [ ] `GET/POST/PATCH/DELETE /api/v1/products/:id/specs/:specId`
- [ ] `GET/POST/PATCH/DELETE /api/v1/products/:id/lots/:lotId`
- [ ] `GET /api/v1/products/:id/sales-history` — sales_status_events
- [ ] 기존 `PATCH /api/v1/products/:id` 의 salesStatus 변경을 hook 으로 sales_status_events에 row 자동 insert
- [ ] `POST /api/v1/products/:id/documents` — 이미 spec에 있음. 기존 `attachments + product_documents` 연동
- [ ] `GET /api/v1/products/:id/documents?type=`

### J-3. 프론트

- [ ] `/products/[id]/page.tsx` 탭 6개 활성화 — 페이지 내 state 또는 별도 라우트
  - [ ] `제품 개요` — 현재 페이지 유지
  - [ ] `시험성적서` — document_type=test_report 필터
  - [ ] `생산 LOT` — lots 목록
  - [ ] `영업 상태 이력` — sales_status_events 타임라인
  - [ ] `관련 프로젝트` — relatedProjectIds
  - [ ] `문의 채팅` — DM 또는 product 채팅방
- [ ] 제품 사양 섹션 `수정` → ProductSpecsModal
- [ ] `변경 이력 →` / `전체 LOT →` 링크 — 해당 탭으로 이동
- [ ] `1:1 대화 시작` → Phase 4 의 `openDirectMessage(product.ownerId)`

---

## K. Phase 8 — 관리자 영역 확장 (doc/14, doc/19 Group E)

**의존성**: Phase 1 감사로그 영속화. Phase 6 알림 정책.
**예상 작업량**: 3~5일

### K-1. 권한 / 역할 매트릭스 (`/admin/permissions`)

- [ ] 페이지 신설 — 현재 5개 role 별로 read/write 가능 영역 매트릭스 (참고용, 변경은 코드 기반)

### K-2. 사용자 초대 / 가입 승인 (`/admin/invitations`)

- [ ] **마이그레이션 016_invitations.sql** — `user_invitations(id, email, role, department_id, token UNIQUE, invited_by FK, accepted_at, expires_at, created_at)`
- [ ] `POST /api/v1/invitations` — admin only. 이메일+역할+부서 → 토큰 발급
- [ ] `GET /api/v1/invitations` — admin only. 목록
- [ ] `DELETE /api/v1/invitations/:id` — revoke
- [ ] (선택) SMTP 발송 — Phase 1 SMTP 도입 후 활성화. 그 전엔 토큰 URL 복사 UI
- [ ] `POST /api/v1/auth/accept-invite` — 토큰 + 비밀번호 + 이름 → 사용자 생성
- [ ] `/admin/invitations` 페이지 — 발급, 목록, 취소

### K-3. 보안 / 로그인 정책 (`/admin/security`)

- [ ] 페이지 — 환경변수 기반 정책 표시 (비밀번호 길이, refresh TTL, session TTL 등). 변경은 .env 안내

### K-4. 알림 정책 (`/admin/notifications`)

- [ ] 전사 기본 알림 종류 토글 (admin 이 회사 전체 default 설정 가능)
- [ ] 사용자별 override는 Phase 6 의 `/account/notifications`

### K-5. 감사 로그 페이지 (`/admin/audit`)

- [ ] Phase 1 의 `audit_logs` 테이블 — 페이징 + actor/action/target 필터
- [ ] 검색 (사용자, 기간, action)

### K-6. 서비스 상태 / 버전 (`/admin/status`)

- [ ] `GET /api/v1/system/health` — 이미 `/health` 있음. 확장 (DB connection, socket clients, uptime)
- [ ] `GET /api/v1/system/version` — package.json version + git short hash
- [ ] 페이지 — 위 정보 + Postgres pool 통계 + 활성 socket 수

---

## L. Phase 9 — 검색 (doc/02, 08)

**의존성**: Phase 2 messages FTS 인덱스. Phase 1 권한.
**예상 작업량**: 2~3일

- [ ] `GET /api/v1/search?q=&scope=all|messages|files|projects|products` — 통합 검색. 각 도메인별 분리 호출
- [ ] 메시지 검색 — 이미 Phase 2 의 `/messages/search` 활용
- [ ] 파일 검색 — file_name LIKE 또는 trigram
- [ ] 프로젝트/제품 검색 — name/description LIKE
- [ ] Topbar 검색 form action → `/search?q=...` 라우트 신설
- [ ] `/search/page.tsx` — 통합 결과 페이지 (탭으로 도메인 분리)

---

## M. Phase 10 — 메시지 에디터 고급 (doc/19 Group G)

**의존성**: Phase 5 멘션 (포맷 토큰 형태 통일).
**예상 작업량**: 1~2주. **후순위**

- [ ] 마크다운 입력 — 굵게/기울임/목록 버튼 활성화 (`**bold**`, `*italic*`, `- list` 토큰 삽입)
- [ ] MessageItem 의 body 렌더링을 마크다운 → HTML (sanitize 필수)
- [ ] 이모지 picker — `emoji-picker-react` 등 라이브러리
- [ ] **예약 전송** — `POST /api/v1/messages/schedule` + 백엔드 cron (또는 setTimeout in-process). 단일 인스턴스라면 OK
- [ ] 메시지 → 업무 만들기 — Phase 5의 entities + AI 명령에서 자동 가능. 또는 hover 메뉴

---

## N. 운영 배포 직전 체크리스트 (Phase 0~9 완료 후)

### N-1. 인프라

- [ ] `Dockerfile` (web + server 멀티스테이지)
- [ ] `docker-compose.prod.yml` — app + postgres + caddy 리버스 프록시
- [ ] Caddy `Caddyfile` — 자동 LE 또는 자체 CA (사내 LAN)
- [ ] Proxmox VM 세팅 가이드 (`docs/21_DEPLOYMENT_GUIDE.md` 신설)
- [ ] Postgres 백업 cron (`pg_dump` daily, 14일 보관)
- [ ] Proxmox VM 스냅샷 weekly

### N-2. 보안 최종 점검

- [ ] bcrypt 적용 + DEFAULT_PASSWORD 환경변수 운영서 제거
- [ ] httpOnly+Secure 쿠키
- [ ] refresh token rotation 동작
- [ ] CORS_ORIGIN 운영 도메인으로 한정
- [ ] 모든 사용자가 `must_change_password=false`인지 확인 (초기 시드 사용자도 변경 완료)
- [ ] 감사 로그가 모든 관리자 action을 캡처하는지
- [ ] 파일 업로드 화이트리스트 + MIME 검사 동작
- [ ] HTTPS 강제 (Caddy)

### N-3. 모바일/PWA

- [ ] iOS Safari + Android Chrome 에서 홈 화면 추가 동작
- [ ] PWA install prompt 표시 확인
- [ ] 오프라인 상태에서 SW 캐시 동작 (정적 자원만이라도)
- [ ] 모바일 알림 권한 요청 동작

### N-4. 데이터

- [ ] 시드 사용자 4명의 이메일을 실제 운영 직원으로 마이그레이션 또는 별도 운영 시드
- [ ] 부서 6개를 실제 한미르 조직도에 맞춰 갱신
- [ ] 더미 채팅방/메시지 시드 제거 또는 별도 환경 분리

### N-5. 백업/복원 리허설

- [ ] `pg_dump` → 다른 빈 DB에 복원 → 어플리케이션 정상 부팅 1회 검증
- [ ] Proxmox 스냅샷 복원 후 docker compose up 정상 확인

---

## O. 진행 정책

1. **새 phase 시작 시** — 본 문서의 해당 phase 체크리스트를 in-progress 표시
2. **commit message** — `[Phase N]` 태그를 prefix 로. 예: `feat: [Phase 1] bcrypt password hashing + first-login change`
3. **phase 완료 시** — 본 문서 체크박스 모두 ✅ + README 의 "기능 구현 현황 요약" 표 갱신
4. **새로 발견되는 작업** — 본 문서에만 추가. `docs/19_UI_FUNCTIONAL_AUDIT.md` 는 UI 스텁 한정으로 두고 본 문서가 단일 마스터 로드맵
5. **순서 변경** — 사용자 결정으로 phase 우선순위 바꿔도 무방하나, schema 마이그레이션 번호는 그대로 005 → 006 → ... 순서대로 적용. 마이그레이션 번호 건너뛰지 말 것

---

## P. 마이그레이션 번호 예약 (충돌 방지)

| 번호 | 내용 | Phase |
| --- | --- | --- |
| 005 | rooms.pinned_message_id | (완료) |
| 006 | users password_hash 시드 bcrypt | (완료) Phase 1 D-1 |
| 007 | users.must_change_password | (완료) Phase 1 D-2 |
| 008 | refresh_tokens | (완료) Phase 1 D-3 |
| 009 | audit_logs | (완료) Phase 1 D-4 |
| 010 | messages.edited_at | Phase 2 |
| 011 | messages FTS index | Phase 2 |
| 012 | decisions | Phase 3 |
| 013 | messages.entities / ai_generated / ai_command / source_message_ids | Phase 5 |
| 014 | user_notifications / user_notification_settings | Phase 6 |
| 015 | product_specs / product_lots / sales_status_events | Phase 7 |
| 016 | user_invitations | Phase 8 |

---

## Q. 의사결정 기록 (2026-05-18 확정)

작업 들어가기 전 사용자 확정 항목 — 본 결정에 따라 각 phase가 빌드됨:

1. **AI 명령용 LLM** → ✅ **`claude-sonnet-4-6`** 사용. 비용 한도는 환경변수 `AI_DAILY_TOKEN_LIMIT`로 운영 직전 설정 (Phase 5)
2. **Web Push 방식** → ✅ **Web Push API + VAPID** (Firebase 의존성 없음, PWA 친화) (Phase 6)
3. **메시지 검색 한국어 처리** → ✅ **`simple` tsvector + 클라이언트 substring 폴백** (Phase 2)
4. **결정사항 read-status** → ✅ **공지처럼 확인 추적 필요**. `decisions` 테이블 + `decision_reads(decision_id, user_id, confirmed_at)` 별도 테이블 추가 (Phase 3)
5. **사용자 초대 이메일** → ✅ **Phase 1에 SMTP 같이 도입**. dev는 mailhog 컨테이너, 운영은 SMTP_* env로 분기
6. **사이드바 그룹화** → ✅ **현재 평평한 nav 유지** (항목 6-7개 규모라 그룹화 ROI 낮음)
7. **간트 차트 라이브러리** → ✅ **자체 CSS grid 유지**, 라이브러리 도입은 후속 phase

### 결정에 따른 Phase 마이그레이션 번호 추가

| 번호 | 내용 | Phase |
| --- | --- | --- |
| 012a | `decisions` 테이블 + `decision_reads` 테이블 (결정 4의 결과) | Phase 3 |

(005~016 외 추가 슬롯이 필요할 경우 `012a`, `014b` 형태로 부번호 사용)
