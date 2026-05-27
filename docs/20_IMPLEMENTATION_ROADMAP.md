# 20. 한미르톡 — spec 100% 도달 단계별 구현 로드맵

> 작성일: 2026-05-18
> 출처: `docs/00`~`docs/19` 통합 정독 + 현재 구현 상태 audit 결과
> 목적: 남은 작업을 **의존성 충돌 없는 순서**로 정리하고, 각 단계별 체크리스트로 완료 여부를 추적

---

## A. 한 페이지 요약

- **현재 위치**: Phase 0~10 완료 — 보안 코어 · 메시지 · 결정사항 · 채팅운영 · 멘션/AI · 알림 · 제품 부속 · 관리자 영역 · 통합 검색 · 메시지 에디터 고급(마크다운·이모지·메시지→업무·예약 전송)
- **남은 작업**: N·R절 운영 배포 — Proxmox VM, .env.prod, 백업 cron 등록, 복원 리허설
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
**진행 상황 (2026-05-19 기준)**: **D-1 ~ D-9 모두 ✅ — Phase 1 완전 종결**
**다음 단계**: Phase 2 (메시지 수정/삭제/검색) 진입

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

#### D-4 sweep (확장 범위, 2026-05-19 일괄 처리) ✅

원래 로드맵에서는 "공지 / 결정사항 / 파일 삭제 / 관리자 로그인"만 명시했으나, 2026-05-19 검수에서 다음 항목들도 audit hook이 없음을 확인 → 일괄 추가:

- [x] `project.update` (`server/src/routes/projects.ts`) — 변경 키만 meta로 기록
- [x] `project.member.add` / `project.member.remove` — 추가/제거된 사용자 id+name 기록, 제거는 warn
- [x] `task.create` (projects.ts의 nested route) / `task.update` / `task.delete` (tasks.ts에 audit import 추가)
- [x] `product.create` / `product.update` / `product.delete` (products.ts에 audit import 추가)
- [x] `notice.create` (notices.ts에 audit import 추가)
- [x] `file.delete` — warn level (file.upload은 일반 사용자 액션이라 제외)
- [x] `auth.login.success / failure` — admin / super_admin 한정. invalid_credentials 시 targeted user를 actor로 기록
- [x] `auth.password.change` — 본인 비밀번호 변경 성공 시
- [x] `decision.*` 결정사항 hook — Phase 3 구현 시 함께 추가 (`decisions.ts` 의 decision.create/update/delete + `messages.ts` 의 decision.create.from_message)

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
- [x] 실제 `sendMail` 호출 활성화 — Phase 8 K-2 의 `routes/invitations.ts:80` 에서 초대 메일 발송 (best-effort, 실패해도 토큰 유효)

### D-8. 채팅방 멤버십 권한 검사 (긴급, 2026-05-19 추가) ✅

> **0순위 — D-3보다 먼저.** 인증된 사용자가 roomId만 알면 비멤버 방에서도 메시지 전송/조회/고정/읽음 표시가 가능한 인가(authorization) 결함. 시범 사용자 확대 전 필수 차단.

**근본 원인**: `routes/rooms.ts`의 read/pin/unpin/messages POST/read marker가 멤버십 검증 없이 `repos.rooms.findById(req.params.roomId)`만 사용. PG `ROOM_SELECT` (postgres.ts:778)에도 `room_members` 필터 없음. 특히 `markRead`의 `INSERT ... ON CONFLICT DO UPDATE` (postgres.ts:963)는 호출만으로 호출자를 그 방 멤버로 만들 수 있어 권한 상승 가능.

- [x] `server/src/routes/rooms.ts` — `ensureRoomAccess(repos, req, res, roomId)` 헬퍼 추가 (admin/super_admin 패스, 그 외 `room.members`에 본인 포함 확인, 비멤버는 404로 위장)
- [x] 적용 라우트: `GET /:id`, `GET /:roomId/messages`, `GET /:roomId/pinned`, `POST /:roomId/read`, `POST /:roomId/pin`, `DELETE /:roomId/pin`, `POST /:roomId/messages`
- [x] `GET /rooms` (목록) — admin 외에는 본인이 멤버인 방만 반환 (라우트 레이어에서 필터)
- [x] `PgMessageRepository.markRead` — `INSERT ... ON CONFLICT` 대신 `UPDATE room_members ... WHERE` 로 변경. 비멤버에게 멤버십 부여 차단
- [x] socket.io `room:join` 이벤트 (`realtime.ts`) — `canAccessRoom()` 멤버십 검증 추가, 비멤버는 silent join 거부 (`realtime.attach()`에 `repos` 주입)

### D-9. 문서 drift 정리 (2026-05-19) ✅

- [x] `.env.example` `UPLOAD_MAX_BYTES` 주석 "25 MB" → "50 MB" + 화이트리스트 안내 추가 (D-6 코드 일치)
- [x] `.env.example` `DEFAULT_PASSWORD` "bcrypt 도입 전까지의 임시 값" 문구 제거 → bcrypt+must_change_password 실제 동작 안내로 교체 (D-1, D-2 완료 반영)
- [x] `docker-compose.yml` 마이그레이션 안내 "001 → 002 → 003" → "001~009 (alphabetical 순서)"
- [x] `docs/16_CLAUDE_CODE_INSTRUCTIONS.md` NestJS 권장 → Express 실태에 맞춰 갱신 ("기술 스택 (현재 구현 기준)" 절이 Express/socket.io/메모리 세션/bcryptjs/Docker Compose 기준으로 재작성됨)

---

## E. Phase 2 — 메시지 보완 (doc/05, 08) ✅ **완료 (2026-05-19)**

**의존성**: 마이그레이션 010, 011. Phase 1과 병행 가능.
**예상 작업량**: 2~3일 / **실제**: 1일

### E-1. 메시지 수정·삭제 API ✅

- [x] **마이그레이션 010_messages_edited_at.sql** — `messages.edited_at TIMESTAMP NULL` 추가 (is_deleted는 001에 이미 존재). updated_at과 분리해 body 편집 시점만 트래킹
- [x] `PATCH /messages/:id` — 본인 작성 메시지만, body 변경 시 edited_at=NOW(). 변경 없으면 no-op로 응답
- [x] `DELETE /messages/:id` — soft delete (is_deleted=true). 본인 또는 admin/super_admin. admin이 타인 메시지 삭제 시 audit log warn 기록
- [x] listByRoom + findById가 deleted 메시지의 body를 "삭제된 메시지입니다"로 마스킹 + attachment 제거. 메모리/PG 양쪽 동일 동작
- [x] 핀 된 메시지가 soft delete되면 자동 unpin (PG는 UPDATE rooms, 메모리는 Map 삭제)
- [x] realtime emit: `message:updated` / `message:deleted` 이벤트 (방 구독자에게)

### E-2. 프론트 UI ✅

- [x] `MessageItem.tsx` — `"use client"` 전환, `currentUserId` / `isAdmin` props로 권한 판정
- [x] hover 메뉴 (수정 / 삭제) — 본인 메시지만 수정, 본인 또는 admin이 삭제. opacity 0→1 transition
- [x] 인라인 편집 textarea — Ctrl+Enter 저장, Esc 취소, 자동 높이 조절, 401 시 세션 만료 처리
- [x] 삭제 시 confirm 다이얼로그 + `chatService.deleteMessage`
- [x] `message:updated` / `message:deleted` 이벤트 listener 추가 (`ChatRoomMounter.tsx`) → 다른 탭/사용자도 실시간 반영
- [x] `editedAt` 표시 "(수정됨)" / `isDeleted` 시 italic + muted color tombstone 스타일

### E-3. 메시지 검색 (doc/05, 08) ✅

- [x] **마이그레이션 011_messages_fts.sql** — `content_tsv tsvector GENERATED ALWAYS AS (...) STORED` + GIN 인덱스 (미래 nori/pg_trgm 도입 대비). 추가로 `pg_trgm` extension + `content gin_trgm_ops` 인덱스 (ILIKE 가속용)
- [x] PG search 쿼리는 ILIKE 사용 (한국어 CJK는 simple tsvector로 토큰 분리 안 됨 → trgm 인덱스가 실효). simple tsvector는 향후 영문 풀텍스트용 슬롯
- [x] `GET /messages/search?q=&roomId=&limit=` — 본인이 접근 가능한 방으로 자동 필터링 (admin은 전체). q는 2자 이상 필수. soft-deleted 제외
- [x] `MessageRepository.search` 인터페이스 + 메모리/PG 구현. roomIds를 caller가 계산해서 전달 (D-8 멤버십 정책 일관)
- [x] `chatService.searchMessages(q, { roomId?, limit? })`
- [x] `/search` 라우트 신설 (`apps/web/src/app/(app)/search/page.tsx`) — searchParams.q로 server component 렌더링. 결과 카드에 방 이름 / 작성자 / 매칭 부분 `<mark>` 하이라이트
- [x] Topbar form action `/chat` → `/search`, placeholder도 "메시지 검색 (2자 이상)"로 갱신

---

## F. Phase 3 — 결정사항 (decisions) (doc/03, 05, 07, 08) ✅ **완료 (2026-05-19)**

**의존성**: 마이그레이션 012. Phase 1 audit hook 적용.
**예상 작업량**: 2일 / **실제**: 0.5일

> **스키마 reconcile**: 001_initial.sql에 decisions 테이블이 이미 존재. 컬럼명을 그대로 사용하기로 결정 — DTO에서 `related_message_id` → `sourceMessageId` 매핑. 012는 `is_deleted` 컬럼과 `decision_reads` 테이블만 추가.

### F-1. 백엔드 ✅

- [x] **마이그레이션 012_decisions.sql** — `decisions.is_deleted BOOLEAN`, `decision_reads(decision_id, user_id, confirmed_at, UNIQUE)` 신규 테이블. 인덱스 (project_id, decided_by, user_id).
- [x] shared types: `Decision`, `CreateDecisionInput`, `UpdateDecisionInput`, `DecisionReadStatus`, `DecisionReadStatusEntry`. `sourceMessageId` + `sourceRoomId` (DB join으로 자동 채워짐) + `totalRecipients` / `confirmedCount` / `myConfirmed` 포함
- [x] `DecisionRepository` 인터페이스 + 메모리/PG 어댑터. `listByProject` / `findById` / `create` / `update` / `softDelete` / `markConfirmed` / `getReadStatus`. soft-deleted은 title/content가 "삭제된 결정사항입니다"로 마스킹
- [x] Routes:
  - [x] `GET /api/v1/projects/:projectId/decisions` — 본인 멤버 프로젝트 한정 (admin 전체)
  - [x] `POST /api/v1/projects/:projectId/decisions` — writer role + 멤버십 검증
  - [x] `GET /api/v1/decisions/:id`
  - [x] `PATCH /api/v1/decisions/:id` — admin 또는 decided_by 본인
  - [x] `DELETE /api/v1/decisions/:id` — admin 또는 decided_by (soft). idempotent
  - [x] `POST /api/v1/decisions/:id/confirm` — 읽음 처리 (per-user)
  - [x] `GET /api/v1/decisions/:id/read-status` — admin 또는 decided_by, 확인 명단 반환
  - [x] `POST /api/v1/messages/:messageId/create-decision` — 채팅 메시지에서 결정사항 생성 (writer + 프로젝트 멤버, source 메시지가 프로젝트 방이어야)
- [x] audit hooks (D-4 sweep과 일관): `decision.create` / `decision.create.from_message` / `decision.update` / `decision.delete`(warn)
- [x] realtime: `decision:new` / `decision:updated` / `decision:deleted` 이벤트. `project:join` / `project:leave` socket 이벤트 + 멤버십 검증 (`canAccessProject`)

### F-2. 프론트 ✅

- [x] `apps/web/src/services/decision.service.ts` — 8개 메소드 (CRUD + confirm + read-status + createFromMessage)
- [x] `/projects/[id]/decisions/page.tsx` 신설 — SSR로 목록 + me 로드, client component `DecisionsWorkspace`에 위임
- [x] `ProjectHeader.tsx` `결정 기록` 탭 href를 `/projects/:id/decisions`로
- [x] `DecisionCreateModal` — writer만 [+ 결정 기록] 버튼 노출. 제목/내용/결정일 입력
- [x] `DecisionInlineEditor` — 카드 내 [수정] 클릭 시 textarea 인라인 편집 (Ctrl+Enter 저장, Esc 취소). admin 또는 decided_by 본인만
- [x] 삭제 confirm + soft delete tombstone (italic + muted)
- [x] 본인 미확인 결정사항에 [확인] 버튼 → markConfirmed. 우측 상단 "{confirmed}/{total} 확인" 카운터 + 본인 확인 완료/필요 Tag
- [x] 출처 메시지 보기 링크 — sourceMessageId가 있으면 `/chat/<roomId>#m-<msgId>`로 이동
- [x] `project:join` socket 구독 → decision:new/updated/deleted 발생 시 router.refresh로 SSR 재렌더링 (다른 사용자/탭 실시간 반영)
- [x] `MessageItem.tsx` — `canCreateDecision` + `projectId` props 추가. hover 메뉴에 [결정사항] 버튼. 클릭 시 `CreateDecisionFromMessageModal` 모달 — 메시지 본문 prefill, 저장 후 결정 페이지로 push

---

## G. Phase 4 — 채팅방 운영 (doc/05, 08, doc/19 Group B) ✅ **완료 (2026-05-19)**

**의존성**: Phase 1 보안. 메시지 mute 는 schema 변경 없음 (`room_members.notification_enabled` 컬럼이 이미 있음).
**예상 작업량**: 2~3일 / **실제**: 0.5일

### G-1. 백엔드 ✅

- [x] `POST /api/v1/rooms` — `{name, type, description?, projectId?, memberIds[]}`. 생성자 자동 owner 멤버. memberIds 검증 (active user), projectId 설정 시 caller가 프로젝트 멤버여야
- [x] `PATCH /api/v1/rooms/:id` — name / description 수정. 멤버만
- [x] `POST /api/v1/rooms/:id/members` — `{userId}` 추가. direct 방은 거부 (`direct_room_fixed_membership`)
- [x] `DELETE /api/v1/rooms/:id/members/:userId` — 본인 외엔 admin만 가능. direct 방 거부
- [x] `POST /api/v1/rooms/:id/mute` / `DELETE` — per-user mute via `room_members.notification_enabled`
- [x] `POST /api/v1/rooms/:id/leave` — 본인 `room_members` 행 삭제. 마지막 멤버 시 `is_active=false` 소프트 archive (PG) / 데이터 제거 (메모리). direct 방 거부
- [x] `POST /api/v1/rooms/direct` — `{userId}` DM 방 find-or-create. 멱등. 처음 만들 때만 201 + audit. 자기 자신과 DM 거부
- [x] `RoomRepository` 확장: create / update / findOrCreateDirect / addMember / removeMember / setMute / leave (메모리 + PG)
- [x] `Room.description` / `Room.muted` (per-user) DTO 필드 추가
- [x] PG `ROOM_SELECT`에 `caller_muted` 컬럼 추가, `findOrCreateDirect`은 `HAVING COUNT(*)=2`로 정확한 pair 매칭
- [x] audit hooks: room.create / room.update / room.member.add / .remove(warn) / .self_remove / room.leave / room.direct.create
- [x] realtime: `room:created` / `room:updated` / `room:membership` 이벤트. socket connect 시 자동 `user:<userId>` 채널 join → 사용자별 알림 가능

### G-2. 프론트 ✅

- [x] `ChatList.tsx` `+ 새 채팅` IconButton 활성화 — `NewChatModal` 모달
  - [x] 1:1 / 그룹 토글 (project room은 후속 — 프로젝트 페이지에서 만드는 게 더 자연스러움)
  - [x] 사용자 검색 (이름/이메일/부서)
  - [x] 본인 자동 제외, multi-select (그룹) / single-select (DM)
  - [x] 그룹은 방 이름 + 2명 이상 필수
  - [x] 생성 → `/chat/[newId]` 라우팅
- [x] `ChatList.tsx` `room:created` / `room:updated` / `room:membership` 구독 → 다른 탭/사용자가 추가/변경/제거 시 자동 반영
- [x] `/chat/[roomId]/page.tsx` 헤더 `더보기` IconButton → `ChatRoomActions` popover (외부 클릭/Esc 닫기). 메뉴: 알림 음소거/켜기 토글 + 방 나가기 (direct 방은 leave 메뉴 숨김)
- [x] (간단 처리) 멤버/고정 IconButton은 RoomInfoPane이 우측에 항상 보이므로 title 안내만 추가. 모달화는 후속
- [x] `ProductOwnerChatButton` — `/products/[id]`의 1:1 대화 시작 버튼이 `openDirectMessage` 호출 → 기존 DM 찾거나 생성 → `/chat/[roomId]` 이동. 본인이 owner인 경우 버튼 숨김
- [x] `chatService` 확장: createRoom / updateRoom / openDirectMessage / addMember / removeMember / muteRoom / unmuteRoom / leaveRoom

### G-3. ChatList 필터링 ✅ (Phase 0에서 기반 완료)

- [x] `읽지 않음` pill — `rooms.filter(r => r.unread > 0)` (Phase 0)
- [x] `고정` pill — `r.pinned` (Phase 0)
- [ ] `멘션` pill — Phase 5 멘션 완료 후 — 본인 멘션된 메시지가 있는 방

---

## H. Phase 5 — 멘션 + AI 명령 (doc/03, 05, 09) ✅ **완료 (2026-05-19)**

**의존성**: 마이그레이션 013 (messages.entities·ai_generated). 외부 LLM 키 (`ANTHROPIC_API_KEY`).
**예상 작업량**: 4~6일

### H-1. 메시지 entities (멘션 토큰) ✅

- [x] **마이그레이션 013_messages_entities.sql** — `entities JSONB DEFAULT '[]'::jsonb`, `ai_generated BOOLEAN`, `ai_command VARCHAR(40)`, `source_message_ids UUID[]` + GIN 인덱스
- [x] shared types `MessageEntity` (type/id/label/offset/length) + ChatMessage 확장 (entities/aiGenerated/aiCommand/sourceMessageIds)
- [x] `POST /api/v1/rooms/:id/messages` — entities[] 받아 sanitize (range check) 후 저장. PG INSERT에 jsonb로 직렬화
- [x] `GET /api/v1/mentions/search?q=&scope=&limit=` — 사용자/부서/프로젝트/업무/파일 통합 검색. project/task/file은 caller membership 필터, user/department는 전체 활성. scope 콤마 구분, limit 기본 20

### H-2. 멘션 UI ✅

- [x] `MessageComposer.tsx` — `@` 입력 감지 popover (mentions/search 80ms 디바운스). ↑↓ 키 + Enter 선택 + Esc 닫기. 선택 시 entities 배열에 추가 + 본문에 `@이름` 삽입 + 캐럿 위치 복원
- [x] entities reconcile — 본문 편집으로 토큰 텍스트가 깨지면 자동 drop
- [x] `MessageItem.tsx` — `renderBodyWithMentions`가 entities offset/length 기반 정확한 토큰 렌더 (CJK 안전). mention은 파란 pill, project/task/file은 다른 톤. legacy `mentions: string[]`도 fallback 유지

### H-3. 멘션 알림 (Phase 6 와 연동) ✅

- [x] entities에 user mention 들어가는 부분까지 완료 (H-1)
- [x] 메시지 append 시 entities를 보고 user_notifications에 row 추가 + socket emit — `server/src/notify.ts:67~117` 에서 mention 추출 → 별도 `mention` kind 로 `createMany` + `dispatchAll` (Phase 6 014 마이그레이션 적용 후 결선)

### H-4. AI 명령 — 백엔드 LLM 어댑터 (doc/09) ✅

- [x] `@anthropic-ai/sdk` 0.96.0 설치
- [x] config: `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`) / `AI_DAILY_TOKEN_LIMIT` (default 0=무제한)
- [x] `server/src/ai/anthropic.ts` — `summarize / extractTasks / extractDecisions / draftNotice / minutes` 5개 함수. transcript 형식으로 ChatMessage[] → 모델. 한국어 응답 system prompt. extract-* 는 JSON 강제
- [x] Routes (`server/src/routes/ai.ts`):
  - [x] `POST /api/v1/ai/chat-summary` — `{roomId, scope: "recent20" | "today" | "thread" | "messageIds", messageIds?}`
  - [x] `POST /api/v1/ai/extract-tasks` (preview only — DB insert 안 함)
  - [x] `POST /api/v1/ai/extract-decisions` (preview only)
  - [x] `POST /api/v1/ai/draft-notice`
  - [x] `POST /api/v1/ai/minutes`
- [x] rate limit — in-memory token bucket per user (분당 5건 + 일당 30건 + AI_DAILY_TOKEN_LIMIT). 429 응답
- [x] 키 없으면 503 `ai_disabled` (UI에서 안내 메시지)
- [x] caller 멤버십 + 메시지 접근 권한 검증 (admin 패스). 모든 호출 audit (`ai.summarize` 등)

### H-5. /명령 UI ✅

- [x] `MessageComposer.tsx` — `/` 입력 시 line-start regex로 감지 → popover (5종 명령). ↑↓ 키 + Enter 선택 + Esc 닫기. @-popover와 mutually exclusive
- [x] 선택 → 입력 텍스트의 `/명령` 토큰 제거 + `AiCommandModal` 띄움
- [x] `AiCommandModal` — 범위 선택 (recent20 / today) + [생성] → AI 호출 → textarea 미리보기 (편집 가능) + [복사] / [채팅에 삽입] / [취소]. **자동 전송 없음** — 사용자가 [채팅에 삽입] 클릭해야만 전송
- [x] `MessageItem` body 앞에 "AI 초안" 뱃지 (gradient purple→blue, aiGenerated 시)
- [x] 삽입 시 aiGenerated=true / aiCommand / sourceMessageIds 도 메시지 row 에
      같이 영속화. `chatService.sendMessage` 옵션 확장 + `routes/rooms.ts`
      엄격 sanitize (aiCommand 5종 화이트리스트, sourceMessageIds 는 UUID
      정규식 검증 + 200개 cap — `source_message_ids UUID[]` 컬럼 22P02 회피).
      `AiCommandModal` 이 직접 옵션 전달. PG 어댑터는 이미 INSERT 처리됨

---

## I. Phase 6 — 알림 시스템 (doc/11) ✅ **완료 (2026-05-19)**

**의존성**: 마이그레이션 014. Phase 5 멘션 완료 후 연동.
**예상 작업량**: 3~5일 / **실제**: 0.5일

### I-1. 알림 모델 ✅

- [x] **마이그레이션 014_notifications.sql** — user_notifications + user_notification_settings + push_subscriptions (Phase 6 I-5도 같은 마이그레이션). 인덱스 (user_id, created_at DESC) + 부분 인덱스 unread
- [x] shared types `Notification`, `NotificationSettings`, `UpdateNotificationSettingsInput`, `PushSubscriptionRecord`(server-only)
- [x] NotificationRepository + PushSubscriptionRepository (메모리/PG)

### I-2. 알림 생성 hook ✅

- [x] `server/src/notify.ts` 중앙 dispatch. settings 존중 (allEnabled / perRoom / perProject)
- 알림 생성 트리거:
  - [x] 메시지 append → 같은 방 멤버 (본인 + 멘션된 사용자 제외) — `message:new`
  - [x] 공지 생성 → 모든 활성 사용자 (본인 제외) → `notice:new` / `notice:mandatory`
  - [x] 업무 배정 (task 생성/수정 시 새 assignee) → 새 assignee — `task:assigned`
  - [x] 마감 임박 — `notifyTaskDueSoonForAll` + KST 09:00 in-process recursive
        setTimeout 스케줄러 (`server/src/index.ts`). status != "done" AND
        dueDate <= KST today. cancelled 프로젝트·비활성 사용자·비멤버 제외.
        in-memory Set 중복 방지(재시작 시 같은 날 중복 발사 가능 — 알림 1개
        더 수준 허용)
  - [x] 프로젝트 상태 변경 → 멤버 — `project:updated`
  - [x] 멘션 (entities 의 사용자) → 멘션된 사용자 — `mention` (별도 kind, 더 강한 신호)
  - [x] 결정사항 등록 → 프로젝트 멤버 (decided_by 제외) — `decision:new`
- [x] 각 알림은 DB insert + socket emit (`notification:new` to `user:<id>`) + (settings.webPushEnabled면) Web Push 발송

### I-3. 백엔드 API ✅

- [x] `GET /api/v1/notifications?unread=true&limit=20` — 본인 알림 inbox
- [x] `GET /api/v1/notifications/unread-count` — 배지용 light endpoint
- [x] `POST /api/v1/notifications/:id/read`
- [x] `POST /api/v1/notifications/read-all`
- [x] `GET /api/v1/notification-settings` — 본인 설정 조회 (첫 호출 시 default 생성)
- [x] `PATCH /api/v1/notification-settings` — 설정 변경 (partial)

### I-4. 프론트 UI ✅

- [x] Topbar `NotificationBell` client component — 종 아이콘 + 미확인 배지 + popover inbox (최근 20). socket `notification:new` 구독 → 실시간 배지 갱신
- [x] 알림 클릭 → markRead + link 라우팅. [모두 읽음] / [설정] 버튼
- [x] `/account/notifications` 페이지 — 전체 토글 + 브라우저 OS 알림 + 웹 푸시 + 채팅방별 + 프로젝트별 토글. 변경 즉시 PATCH
- [x] 브라우저 Notification API — 권한 요청 + `notification:new` 수신 시 `new Notification(title, {body})` (settings.browserEnabled 시). `NotificationBell.tsx:41~46` (granted 체크 + new Notification) + `NotificationSettingsForm.tsx:38` (requestPermission). 위와 동일 항목이라 1행으로 통합 — 중복 미체크 행 정리.

### I-5. Web Push (PWA 푸시) ✅

- [x] `web-push` + `@types/web-push` 의존성 추가
- [x] `server/scripts/generate-vapid.ts` — VAPID 키 한 번 생성 후 .env에 추가
- [x] config — `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. 키 없으면 push 자동 disabled (in-app 알림은 정상)
- [x] `server/src/push.ts` — `isPushEnabled` / `pushToUser` / `pushNotification`. 410 Gone 시 endpoint 자동 정리
- [x] 마이그레이션 014에 `push_subscriptions(user_id, endpoint UNIQUE, p256dh, auth, user_agent)` 추가. PushSubscriptionRepository (메모리/PG)
- [x] `GET /api/v1/push-subscriptions/vapid-public-key` (프론트가 PushManager.subscribe에 사용)
- [x] `POST /api/v1/push-subscriptions` — 브라우저 subscription 등록 (upsert)
- [x] `DELETE /api/v1/push-subscriptions` — endpoint 기준 해제
- [x] 알림 생성 시 settings.webPushEnabled=true 사용자에게 자동 push 발송 (notify.ts의 dispatch 헬퍼)
- [x] `apps/web/public/sw.js` — push event + notificationclick listener
- [x] `apps/web/src/services/push.service.ts` — `enablePush` / `disablePush`. 권한 요청 + SW 등록 + PushManager.subscribe + 서버 등록 한 번에
- [x] `/account/notifications` — "웹 푸시" 토글 onChange에서 enablePush/disablePush 호출, 실패 시 inline error

---

## J. Phase 7 — 제품 부속 (doc/06, doc/19 Group C) ✅ **완료 (2026-05-20)**

**의존성**: 마이그레이션 015. Phase 1 audit hook 적용.
**예상 작업량**: 3~5일

### J-1. 스키마

- [x] **마이그레이션 015_product_subsystems.sql**:
  - `product_specs (id, product_id NOT NULL FK, key TEXT NOT NULL, value TEXT NOT NULL, sort_order INT, UNIQUE(product_id, key))`
  - `product_lots (id, product_id NOT NULL FK, lot_no TEXT NOT NULL, produced_at DATE, quantity_kg NUMERIC, verdict VARCHAR(20), tested_at DATE, notes TEXT, UNIQUE(product_id, lot_no))`
  - `sales_status_events (id, product_id NOT NULL FK, from_status VARCHAR(40), to_status VARCHAR(40) NOT NULL, reason TEXT, changed_by NOT NULL FK users, changed_at TIMESTAMP NOT NULL DEFAULT NOW())`
  - 기존 `product_documents` 활용 — `document_type` 인덱스 추가 (enum 강제는 데이터 안정화 후 별도 마이그레이션). UI 필터: catalog, test_report, proposal, price_sheet, install_guide, faq, certificate, image

### J-2. 백엔드 API

- [x] `GET/POST/PATCH/DELETE /api/v1/products/:id/specs/:specId`
- [x] `GET/POST/PATCH/DELETE /api/v1/products/:id/lots/:lotId`
- [x] `GET /api/v1/products/:id/sales-history` — sales_status_events
- [x] 기존 `PATCH /api/v1/products/:id` 의 salesStatus 변경을 hook 으로 sales_status_events에 row 자동 insert (PATCH body `salesReason`을 reason으로 캡처)
- [x] `POST /api/v1/products/:id/documents` — `{attachmentId, documentType}` JSON. 기존 `/files/upload?productId=`로 올린 attachment를 `product_documents`로 분류하는 2-step 연동. 8종 type 화이트리스트 검증, audit `product.document.add`. attachment 부재 시 404 `attachment_not_found`
- [x] `GET /api/v1/products/:id/documents?type=` — `product_documents` JOIN `attachments` (+uploader). type 필터(8종), 잘못된 type은 400 `type_invalid`
- [x] `DELETE /api/v1/products/:id/documents/:docId` — product_documents 링크 + attachment row + 디스크 파일까지 정리. audit `product.document.delete` (warn)

### J-3. 프론트

- [x] `/products/[id]/page.tsx` 탭 6개 활성화 — `ProductTabs.tsx` 클라이언트 state로 전환
  - [x] `제품 개요` — DB-backed specs + 최근 상태 3건 + side cards (분기 판매, 담당자)
  - [x] `시험성적서` — `product_documents` (document_type=test_report) DB 연동. 업로드 모달(`ProductDocumentUploadModal`) + 다운로드 링크 + 삭제 버튼
  - [x] `생산 LOT` — lots 목록 + 작성자 수정/삭제
  - [x] `영업 상태 이력` — sales_status_events 타임라인
  - [x] `관련 프로젝트` — relatedProjectIds
  - [x] `문의 채팅` — ProductOwnerChatButton (openDirectMessage)
- [x] 제품 사양 섹션 `수정` → ProductSpecsModal (배치 add/edit/remove + sort_order 자동 부여)
- [x] `LOT 등록` / 행별 `수정` → ProductLotModal (생성/수정/삭제 + 409 중복 lot 안내)
- [x] `1:1 대화 시작` → Phase 4 의 `openDirectMessage(product.ownerId)` (재사용)

---

## K. Phase 8 — 관리자 영역 확장 (doc/14, doc/19 Group E) ✅ **완료 (2026-05-20)**

**의존성**: Phase 1 감사로그 영속화. Phase 6 알림 정책.
**예상 작업량**: 3~5일

> **Step 0 (선행)**: `/admin`을 단일 페이지 + 앵커 nav에서 별도 `/admin/*` 라우트로 전환. 사이드바를 `/admin/layout.tsx` + `AdminNav`(usePathname 활성표시)로 추출, 역할 가드를 layout으로 이동.
>
> **2026-05-20 버그 수정**: K-5 작업 중 `auditLog`가 합성 req 객체(`{...req}`)에서 lazy `headers` getter를 잃어 `auth.login.*` / `invitation.accept` 감사가 Phase 1부터 silent 누락돼 온 것을 발견 → `auditLog`에 명시적 `actorOverride` 파라미터 추가로 해결.

### K-1. 권한 / 역할 매트릭스 (`/admin/permissions`) ✅

- [x] 페이지 신설 — 5개 role × 13개 기능 영역 접근 권한 매트릭스 (정적 참고용, 변경은 코드 기반). 범례 + super_admin≡admin 안내

### K-2. 사용자 초대 / 가입 승인 (`/admin/invitations`) ✅

- [x] **마이그레이션 016_invitations.sql** — `user_invitations(id, email, role, department_id, token UNIQUE, invited_by FK, accepted_at, expires_at, created_at)`
- [x] `POST /api/v1/invitations` — admin only. 이메일+역할+부서 → 7일 만료 토큰 발급. 이미 가입된 이메일은 409
- [x] `GET /api/v1/invitations` — admin only. 목록 (status pending/accepted/expired 파생)
- [x] `DELETE /api/v1/invitations/:id` — revoke
- [x] SMTP 발송 — best-effort 초대 메일 (실패해도 초대 유효). admin은 토큰 URL 복사 UI도 사용 가능
- [x] `GET /api/v1/auth/invitation/:token` + `POST /api/v1/auth/accept-invite` — 비인증. 토큰 검증 + 원자적 소진(markAccepted) 후 계정 생성
- [x] `/admin/invitations` 페이지 — 발급 폼, 목록, URL 복사, 취소
- [x] 공개 `/invite` 수락 페이지 — preview + 이름·비밀번호 설정

### K-3. 보안 / 로그인 정책 (`/admin/security`) ✅

- [x] `GET /api/v1/system/security-policy` — 비밀번호 길이/해시·토큰 TTL·쿠키·업로드 한도를 config + auth 상수에서 파생
- [x] 페이지 — 인증·세션·파일/메일 정책 카드. 변경은 .env / 코드 안내

### K-4. 알림 정책 (`/admin/notifications`) ✅

- [x] **마이그레이션 017_org_notification_defaults.sql** — 카테고리별 회사 전체 게이트
- [x] 전사 기본 알림 종류 토글 (6 카테고리: message·mention·notice·task·project·decision). `GET/PATCH /api/v1/org-notification-defaults`
- [x] `notify.ts` 각 dispatch가 카테고리 게이트 확인 — 끄면 전사 발송 중지
- [x] 사용자별 override는 Phase 6 의 `/account/notifications` (기존)

### K-5. 감사 로그 페이지 (`/admin/audit`) ✅

- [x] `AuditRepository.search()` — `audit_logs` 페이징(offset) + action/actor/기간 필터 + distinct action 목록 (메모리·PG)
- [x] `GET /api/v1/audit` (admin) + `/admin/audit` 페이지 — 필터바 + 테이블 + 페이지네이션

### K-6. 서비스 상태 / 버전 (`/admin/status`) ✅

- [x] `GET /api/v1/system/health` — 어댑터·uptime·활성 socket 수·DB 연결 + PG pool 통계
- [x] `GET /api/v1/system/version` — package.json version + git short hash + Node·환경
- [x] 페이지 — 위 정보 카드 + 수동 새로고침

---

## L. Phase 9 — 검색 (doc/02, 08) ✅ **완료 (2026-05-20)**

**의존성**: Phase 2 messages FTS 인덱스. Phase 1 권한.
**예상 작업량**: 2~3일

- [x] `GET /api/v1/search?q=&scope=all|messages|files|projects|products` — 통합 검색. 도메인별 분리 조회, 도메인당 20건 상한
- [x] 메시지 검색 — Phase 2 `MessageRepository.search` 재사용 + 방 멤버십 스코프(D-8)
- [x] 파일 검색 — `file_name` substring 매칭 (라우트 레벨 — 내부툴 데이터량엔 충분)
- [x] 프로젝트/제품 검색 — name/code/category/description substring 매칭
- [x] Topbar 검색 form action `/search` (Phase 2에서 신설됨) — placeholder "통합 검색"으로 갱신
- [x] `/search/page.tsx` — SSR + `SearchResultsView` 클라이언트 컴포넌트. 전체/메시지/파일/프로젝트/제품 탭, "전체"는 도메인별 5건 미리보기 + 전체보기 전환

---

## M. Phase 10 — 메시지 에디터 고급 (doc/19 Group G)

**의존성**: Phase 5 멘션 (포맷 토큰 형태 통일).
**예상 작업량**: 1~2주.
**진행 상황 (2026-05-27 기준)**: 마크다운 입력·렌더링·이모지 picker 완료 →
메시지→업무 / 예약 전송까지 마무리해 **Phase 10 종결**.

> **2026-05-27 재분류**: 이전 미체크 5개 항목 중 실제로는 3개가 구현 완료
> 상태였음(drift). 라이브러리 도입 없이 React node 트리 + 커스텀 emoji
> popover 로 구현 → `dompurify` / `sanitize-html` 미도입 (HTML 문자열 렌더
> 경로 자체가 없음). 남은 2개 항목(메시지→업무, 예약 전송) 을 본 Phase
> 마무리로 구현.

### M-1. 마크다운 입력·렌더링 ✅

- [x] 굵게/기울임/목록 버튼 활성화 — `apps/web/src/components/chat/MessageComposer.tsx` 의 `wrapSelection("**","**")`, `wrapSelection("*","*")`, `prefixLines("- ")`. mousedown + preventDefault 로 textarea selection 보존.
- [x] MessageItem body 렌더링 — `apps/web/src/components/chat/MessageItem.tsx` 의 `renderMessageBody` + `renderMarkdownSegment` + `parseInlineMarkdown`. **React node 트리 반환** (dangerouslySetInnerHTML 미사용 → sanitize 라이브러리 불필요). entities(멘션) 영역은 마크다운 파싱에서 제외해 토큰 깨짐 방지.
- [x] 지원 토큰: `**bold**`, `*italic*`, 줄 시작 `- ` 만. backslash escape / 중첩 / link / code 미지원 (사내 메신저 본문에 필요한 최소만).

### M-2. 이모지 picker ✅

- [x] 외부 라이브러리(`emoji-picker-react` 등) 도입하지 않고 커스텀 popover 로 구현 — `apps/web/src/components/chat/MessageComposer.tsx` 의 `EMOJI_GROUPS` 3그룹(업무/감정/자료) 큐레이션 + popover.
- [x] 외부 클릭/Esc 닫기, textarea 포커스 유지(mousedown preventDefault), 캐럿 위치에 삽입 후 caret 복원.

### M-3. 메시지 → 업무 만들기 ✅

- [x] `MessageItem` hover action 에 "업무" 버튼 추가 — 프로젝트 방(projectId 있음)에서 writer 권한 보유 시에만 노출.
- [x] `TaskCreateModal` props 확장 — `initialTitle?` / `initialDescription?`. 메시지 첫 줄 80자가 제목, 본문 전체가 설명으로 prefill.
- [x] 생성 성공 후 `router.refresh()`. 서버는 기존 task create API 의 project access 검사를 그대로 사용.
- [x] `MessageComposer` 의 dead 한 "업무 만들기" 툴바 버튼 제거 (action 이 hover 로 이동).

### M-4. 예약 전송 (DB 영속) ✅

> **결정 (2026-05-27)**: in-process setTimeout 방식은 서버 재시작·배포 시
> 예약 메시지가 증발하는 운영 리스크가 있어 **DB 영속 + 1분 주기 poller**
> 로 구현. 단일 VM 전제라 row lock 은 최소화(`sent_at IS NULL` guard 만).

- [x] **마이그레이션 018_scheduled_messages.sql** — `scheduled_messages(id, room_id, user_id, content, entities JSONB, attachment_id, scheduled_at, sent_at, cancelled_at, error, created_at)` + 3개 인덱스 (due / room_id / user_id).
- [x] `ScheduledMessageRepository` (메모리 + PG) — `create` / `listForUser` / `listDue` / `findById` / `markSent` / `markFailed` / `cancel`.
- [x] Routes (`server/src/routes/scheduled-messages.ts`):
  - `POST /api/v1/messages/schedule` — 멤버십 + 미래 시각 검증. attachment 권한 검증.
  - `GET /api/v1/messages/scheduled?roomId=` — 본인 예약만 (sent/cancelled 제외).
  - `DELETE /api/v1/messages/scheduled/:id` — 작성자 또는 admin/super_admin. 이미 보낸 건은 409.
- [x] Poller (`server/src/scheduled-poller.ts`) — boot 시 시작, 60초 주기 recursive setTimeout. due row 를 `sent_at IS NULL` guard 로 갱신 후 일반 메시지 append 경로(`appendUserMessage` 헬퍼) 재사용. 전송 시점 멤버십 재확인 — 탈퇴 사용자/archive 방은 `error` 로 마킹.
- [x] 프론트 UI — `MessageComposer` 의 "예약 전송" 버튼 활성화 + `ScheduleSendModal.tsx`. 한국어 검증 메시지, datetime-local 최소값 = 현재 시각.

---

## N. 운영 배포 계획 (Phase 9 완료 후)

### N-0. 배포 아키텍처 (2026-05-20 확정)

> 본 절의 모든 구성은 아래 확정 사항을 전제로 한다. 변경 시 N-1 이하를 재검토.

- **호스트**: 사내 Proxmox VE 서버 (내부 스토리지 풀 약 40TB)
- **게스트**: **Ubuntu Server VM 1대.** 기능별 다중 VM 분리는 하지 않는다.
  - 앱이 단일 인스턴스 설계 — 인메모리 세션 스토어(`SessionStore`), 인메모리 AI rate limiter, socket.io 단일 노드(Redis 어댑터 없음). 다중 인스턴스는 재설계 없이는 불가.
  - 사내 협업툴 규모상 수평 확장 불필요. 격리 단위는 VM이 아니라 **Docker 컨테이너**.
- **컨테이너 구성** — 단일 VM 내 `docker-compose.prod.yml`:
  - `caddy` — 리버스 프록시 + HTTPS 종단
  - `web` — Next.js 프론트
  - `server` — Express API + socket.io (동일 프로세스)
  - `postgres` — PostgreSQL 16
- **파일 스토리지**: **VM 로컬 디스크** (40TB 풀에서 할당). `UPLOAD_DIR`로 host 경로 지정 후 `server` 컨테이너에 바인드 마운트. Cloudflare R2 / MinIO / S3 **미사용** — 사내 보관 + 데이터 주권 + 운영 부담 0. (파일 바이트=파일시스템, 메타데이터=DB 구조 유지 — 파일을 DB BLOB로 넣지 않음)
- **Redis 미사용** — 세션·rate limit이 인메모리, 단일 인스턴스라 불필요.
- **확장 경로**: 1차로 Proxmox에서 해당 VM에 CPU/RAM 수직 증설. 실제 필요가 생길 때만 Redis 도입 + 다중 인스턴스를 재검토 (현 로드맵 범위 밖).

### N-1. 인프라 구성

> **2026-05-21 진행**: 아래 파일 4종 작성 + Docker 이미지 빌드·기동 검증 완료
> (server·web 멀티스테이지 이미지 빌드 성공, 깨끗한 볼륨에서 마이그레이션
> 001~017 → 25개 테이블 전부 적용 확인, PG 모드 로그인·검색 스모크 통과).
> 남은 항목: Proxmox VM 생성 · 운영 `.env.prod` 실값 작성 · runbook 상세화.

- [x] `Dockerfile` — web / server (멀티스테이지 빌드) — `apps/web/Dockerfile`, `server/Dockerfile` (+ `.dockerignore`)
- [x] `docker-compose.prod.yml` — `caddy` + `web` + `server` + `postgres` 4개 서비스
  - postgres 데이터: named volume
  - 업로드 디렉터리: host 40TB 경로 ↔ `server` 컨테이너 bind mount
  - 마이그레이션 `server/src/db/migrations` → postgres initdb 마운트 (001~017)
  - dev compose와 볼륨 충돌 방지용 별도 프로젝트명 `name: hanmir-talk-prod`
- [x] Caddy `Caddyfile` — 운영 도메인 + HTTPS. 인터넷 연결 시 자동 Let's Encrypt, 폐쇄망이면 사내 자체 CA 인증서 (`tls` / `tls internal` 안내 주석 포함)
- [x] 파일 스토리지 — `UPLOAD_DIR`을 40TB 디스크 경로로 설정, compose에서 bind mount. **앱 코드 변경 불필요** — `config.uploadDir`가 이미 `UPLOAD_DIR`을 지원
- [ ] Proxmox — Ubuntu Server VM 생성, 가상 디스크를 40TB 풀에서 넉넉히 할당(또는 전용 데이터셋 마운트), CPU/RAM 적정 산정
- [ ] `.env.prod` 운영값 작성 — 템플릿 `.env.prod.example` 을 `.env.prod`
      로 복사해 채움. **필수 4섹션**: `PUBLIC_ORIGIN` · `POSTGRES_*` ·
      `UPLOAD_DIR_HOST` · `DEFAULT_PASSWORD`. **선택 3섹션**: `SMTP_*` ·
      `ANTHROPIC_*` · `VAPID_*` (비워두면 해당 기능만 비활성).
      `PUBLIC_ORIGIN` 단계별 예시:
        - Phase 1 (admin/Tailscale): `http://100.x.y.z`
        - Phase 2 (사내 직원 LAN):   `http://192.168.0.110`
        - Phase 3 (도메인+HTTPS):    `https://talk.hanmirfe.com`  ← R-9 진입 시
      HTTPS/도메인은 **Phase 3 진입 조건이며 Phase 1·2 의 가동을 막지 않는다.**
      파일 권한 600 + `git check-ignore .env.prod` 로 무시 확인
- [ ] 배포 runbook — VM 세팅 ~ `docker compose up`까지 단계별 절차를 본 문서 **R절(배포 runbook)** 에 작성 (별도 파일 없음, 배포 준비 시점에 상세화)

### N-2. 보안 최종 점검

> Phase 1·2 (사내 HTTP, R-0 모델) 와 Phase 3 (도메인+HTTPS) 에서 적용
> 시점이 다른 항목이 있다. 각 줄 끝의 [Phase X] 표시 참고.

- [ ] bcrypt 적용 + `DEFAULT_PASSWORD` 운영서 변경 [Phase 1+]
- [ ] httpOnly 쿠키 — 항상 적용. Secure 플래그는 `PUBLIC_ORIGIN` 이
      https:// 면 서버가 자동 부착 [Phase 1+: httpOnly / Phase 3+: Secure]
- [ ] refresh token rotation 동작 [Phase 1+]
- [ ] `CORS_ORIGIN` 이 실제 접속 origin 과 일치 — Phase 1·2 는 LAN/
      Tailscale IP, Phase 3 는 운영 도메인 [Phase 1+]
- [ ] 모든 사용자가 `must_change_password` 처리 완료 (초기 시드 사용자 포함)
      — `/admin/status` 의 "초기 비밀번호 변경" 카드(#5)가 활성 사용자 중
      미해결 인원과 신원(이름·부서·직급·이메일, 최대 8명 + 더보기 카운트)을
      노출하므로 admin 이 한 화면에서 확인 가능. 0명일 때 카드가 "완료"
      태그로 전환되면 본 체크박스를 ✅ 처리 [Phase 2+]
- [ ] 감사 로그가 관리자 action 을 캡처 (Phase 8 K-5 에서 페이지·검색 점검 완료) [Phase 1+]
- [ ] 파일 업로드 화이트리스트 + MIME 검사 동작 [Phase 1+]
- [ ] HTTPS 활성화 (Caddy 도메인 + 인증서) — **Phase 3 진입 조건이며
      Phase 1·2 가동을 막지 않는다.** R-9 절차로 별도 수행 [Phase 3]
- [ ] VAPID / ANTHROPIC / SMTP 키를 운영 시크릿으로 분리, 리포지토리
      미포함 확인 (필요한 항목만 — Phase 1·2 는 VAPID 비워둬도 무방) [Phase 1+]

### N-3. 모바일/PWA

- [ ] iOS Safari + Android Chrome 에서 홈 화면 추가 동작
- [ ] PWA install prompt 표시 확인
- [ ] 오프라인 상태에서 SW 캐시 동작 (정적 자원만이라도)
- [ ] 모바일 알림 권한 요청 동작

### N-4. 데이터

- [x] 시드 사용자를 실제 운영 직원으로 교체 — `003_seed_minimum.sql` 을 실제 22명으로 재작성(2026-05-21), 입력 출처 `직원데이터_입력양식.md`
- [x] 부서를 실제 한미르 조직도에 맞춰 갱신 — 12개 부서로 재작성
- [x] 더미 채팅방/메시지 — PG 어댑터 시드(003)에는 채팅방/메시지가 없음(부서·사용자만). 더미 룸/메시지는 메모리 어댑터(dev 전용)에만 존재 → 운영(PG)엔 미반영, 별도 제거 불필요

### N-5. 백업 / 복원

> 실 스크립트·복원 가이드·cron 등록 예시는 R-7 에 통합되었다. 본 절은
> 운영 체크리스트만 유지.

- [ ] `ops/backup/backup-prod.sh` 한 번 수동 실행해 산출물 3개
      (`db.sql.gz`·`uploads.tar.gz`·`manifest.txt`) 생성 확인
- [ ] root cron 등록 (R-7 의 한 줄) — 매일 02:30 daily 실행 + 14일 보관
- [ ] `/var/log/hanmir-talk-backup.log` 첫 실행 후 1주 관찰 — 매일 PASS
      라인이 보이는지
- [ ] Proxmox VM 스냅샷 weekly (Proxmox UI 또는 별도 cron — 본 스크립트
      와 독립적인 안전망)
- [ ] 복원 리허설 — `ops/backup/RESTORE_REHEARSAL.md` 7단계 + 성공 기준
      체크리스트. **월 1회 또는 주요 릴리스 직전**
- [ ] (선택) 오프사이트 백업 — 화재/도난 대비. DB 덤프 + 업로드를
      사외(R2 버킷 등)로 주기 복제. **1차 저장소가 아닌 백업 사본 용도**

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
| 010 | messages.edited_at | (완료) Phase 2 E-1 |
| 011 | messages FTS + trgm 인덱스 | (완료) Phase 2 E-3 |
| 012 | decisions.is_deleted + decision_reads | (완료) Phase 3 |
| 013 | messages.entities / ai_generated / ai_command / source_message_ids | (완료) Phase 5 |
| 014 | user_notifications / user_notification_settings / push_subscriptions | (완료) Phase 6 |
| 015 | product_specs / product_lots / sales_status_events | (완료) Phase 7 |
| 016 | user_invitations | (완료) Phase 8 K-2 |
| 017 | org_notification_defaults | (완료) Phase 8 K-4 |

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

---

## R. 배포 runbook

> 별도 `21_DEPLOYMENT_GUIDE.md` 는 만들지 않고 배포 절차는 본 절에 통합한다.
> 본 runbook 은 "사내 망 분리 + Tailscale 로 관리자 우선 접근" 결정(2026-05-26)을
> 전제로 한다. 도메인/HTTPS 는 외부 의존성이라 1단계 사내 검증을 지연시키지
> 않는다 — R-9 가 별도 단계로 분리됨.

### R-0. 접근 모델 — 3단계 단계적 출시

운영 가동은 한 번에 외부 공개로 가지 않고, 다음 3단계로 점진 출시한다.
각 단계는 앞 단계의 검증이 끝나야 진행한다.

| Phase | 대상 | 접근 경로 | HTTPS | 본 단계에서 풀어야 할 것 |
|---|---|---|---|---|
| **Phase 1 — admin 검증** | 운영 담당자(본인) | Tailscale `100.x.y.z` | 불필요 | VM 부팅, 컴포즈 기동, 마이그 적용, 스모크 |
| **Phase 2 — 사내 직원 사용** | 한미르 직원 22명 | LAN IP(예: `http://192.168.0.110`) 또는 Tailscale IP | 불필요 | 시드 사용자 비밀번호 변경, 1~2주 운영 안정성 관찰 |
| **Phase 3 — 도메인 + SSL** | 동일 직원 + 외부 영업 출장 | `https://talk.hanmirfe.com` 등 | 필수 | 사내 DNS 또는 외부 DNS 결정, 인증서 조달, Caddyfile 갱신, PWA install·Web Push 활성화 |

**중요한 분리 원칙**: Phase 3 의 도메인·SSL·DNS 는 외부 협조(IT팀,
도메인 등록자, 인증서 발급)에 의존하므로 **Phase 1/2 진입을 절대
가로막지 않는다.** 운영 도구의 가치는 Phase 1·2 에서 90% 확보된다.

### R-1. IP 토폴로지 (운영 가동 직전 채워둘 표)

배포 직전 IT 담당자와 다음 값을 확정해 표를 채운 뒤 본 문서에 남긴다.

| 구분 | 위치 | LAN IP | Tailscale IP | 비고 |
|---|---|---|---|---|
| Proxmox host (pve01) | 사내 물리 | `192.168.0.100` | (선택) | 관리자 Web UI :8006 — Tailscale 전용 |
| Ubuntu VM (hanmir-dev) | Proxmox 게스트 | `192.168.0.111` | `100.x.x.x` | 빌드/마이그/스모크 검증 |
| Ubuntu VM (hanmir-prod) | Proxmox 게스트 | `192.168.0.110` | `100.y.y.y` | 운영 본 가동 |
| Docker 내부 네트워크 | 위 VM 내 | compose 관리(외부 비노출) | — | postgres/server/web 서로 통신 전용 |

- **Postgres** 는 어떤 경우에도 LAN/Tailscale 에 노출하지 않는다 — Docker
  컴포즈 내부망 안에서만 server 컨테이너가 접근.
- **Caddy** 는 초기엔 :80 만 노출 (R-9 에서 :443 추가).
- **SSH/관리자 작업** 은 가능한 한 Tailscale 경로로만 도달하도록 ACL 구성.

### R-2. 포트 정책

| 포트 | 방향 | LAN | Tailscale | 외부 인터넷 |
|---|---|---|---|---|
| 80 (HTTP) | inbound → caddy | ✅ (Phase 1·2) | ✅ | ❌ |
| 443 (HTTPS) | inbound → caddy | (Phase 3 이후) | ✅ | (Phase 3 이후) |
| 22 (SSH) | inbound → VM | ⚠️ Tailscale 외 차단 권장 | ✅ | ❌ |
| 8006 (Proxmox UI) | inbound → host | ⚠️ Tailscale 외 차단 권장 | ✅ | ❌ |
| 5432 (PostgreSQL) | — | ❌ 노출 안 함 | ❌ | ❌ |
| 4000 (server API) | — | ❌ 컴포즈 내부 전용 | ❌ | ❌ |
| 3000 (Next.js) | — | ❌ 컴포즈 내부 전용 | ❌ | ❌ |

ufw 또는 Proxmox 방화벽으로 인바운드를 명시적으로 좁힐 것.

### R-3. Proxmox VM 준비 명령

운영 VM(hanmir-prod) 가정. dev VM(hanmir-dev) 도 동일 절차.

```bash
# 1) Ubuntu 패키지 최신화
sudo apt update && sudo apt upgrade -y

# 2) 시간대 KST
sudo timedatectl set-timezone Asia/Seoul

# 3) Docker Engine + Compose 플러그인
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 4) 본인 계정을 docker 그룹에 (로그아웃 후 재로그인 필요)
sudo usermod -aG docker $USER

# 5) Tailscale (관리자 접근 경로)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh                 # --ssh 로 Tailscale SSH 도 활성화
# 출력된 URL 로 어드민이 본인 계정에 노드 등록

# 6) 업로드 디렉터리 생성 (UPLOAD_DIR_HOST 와 일치)
sudo mkdir -p /srv/hanmir-talk/uploads
# 컨테이너의 node 사용자(uid 1000) 가 쓸 수 있도록 소유권 조정
sudo chown -R 1000:1000 /srv/hanmir-talk/uploads
sudo chmod 750 /srv/hanmir-talk/uploads

# 7) 리포지토리 clone (또는 git pull 로 최신화)
cd /srv && sudo git clone <repo-url> hanmir-talk
sudo chown -R $USER:$USER /srv/hanmir-talk
cd /srv/hanmir-talk

# 8) .env.prod 준비
cp .env.prod.example .env.prod
$EDITOR .env.prod                       # 섹션 1~4 필수 채우기
chmod 600 .env.prod
git check-ignore .env.prod              # 출력에 ".env.prod" 가 보이면 정상
```

### R-4. `.env.prod` 작성 가이드 (Tailscale 우선)

`.env.prod.example` 본문에 섹션별 상세 안내가 있다 — 본 R-4 는 배포 단계별
지름길만 정리.

**Phase 1 (admin 검증, Tailscale)**:
```
PUBLIC_ORIGIN=http://100.x.y.z          # 본 VM 의 Tailscale IP
```
- `http://` 이므로 서버가 쿠키에 `Secure` 플래그를 부착하지 않는다 (의도된
  동작 — HTTP 환경에서 `Secure` 가 붙으면 브라우저가 쿠키를 전송 안 함).

**Phase 2 (사내 직원 사용, LAN IP)**:
```
PUBLIC_ORIGIN=http://192.168.0.110      # 본 VM 의 LAN IP
```
- 위와 동일 — HTTP, Secure 미부착.
- PWA install / Web Push 는 **여전히 비활성** (브라우저가 HTTPS 요구).

**Phase 3 (도메인 + HTTPS, R-9 에서)**:
```
PUBLIC_ORIGIN=https://talk.hanmirfe.com
```
- 서버가 자동으로 Secure 쿠키 부착. Caddyfile / 포트 :443 / 인증서 마운트
  추가 필요 — R-9 절차 참고. 본 한 줄만 바꿔도 server 코드는 무변경.

필수 4개 섹션(접속 주소, Postgres, 업로드 경로, 시드 비밀번호) 만 채우면
부팅 가능하다. SMTP·AI·Web Push 는 비워둬도 동작(해당 기능만 비활성).

### R-5. Compose 기동 + 로그 검증

```bash
cd /srv/hanmir-talk

# 1) 빌드 + 백그라운드 기동
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 2) 컨테이너 상태 확인 (4개 모두 healthy 까지 ~30s)
docker compose -f docker-compose.prod.yml ps

# 3) 서버 로그 — 다음 두 줄이 보여야 정상
#    [hanmir-server] repository adapter: postgres
#    [hanmir-server] listening on http://localhost:4000/api/v1
docker compose -f docker-compose.prod.yml logs -f server

# 4) 마이그레이션 적용 — 빈 PG 볼륨일 때만 initdb 가 001~017 을 자동 적용.
#    이후 새 마이그(018+) 는 수동. 호스트 쉘에 POSTGRES_USER/DB 를 export
#    할 필요 없도록, 컨테이너 내부 sh -c 안에서 변수 참조:
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
         -f /docker-entrypoint-initdb.d/018_xxx.sql'
```

빌드 중 에러가 나면 `docker compose logs <service>` 로 개별 컨테이너
로그를 본다. 가장 자주 보는 실패:
- `chown` 실패 → R-3 의 업로드 디렉터리 권한 점검
- `password authentication failed` → `.env.prod` 의 POSTGRES_PASSWORD 와
  볼륨에 이미 박힌 비밀번호 불일치 (운영 첫 가동이면 `docker compose down -v`
  로 볼륨 초기화 후 재기동)

### R-6. 스모크 검증 — `npm run smoke:prod`

#6 에서 추가된 운영 스모크 스크립트(8단계 PASS/FAIL). **개발자/관리자
머신에서 Tailscale 경유로 운영 VM 을 찌르는 방식이 가장 자연스럽다**
(운영 VM 안에서 `npm install` 하지 않아도 됨).

전제:
- 리포지토리가 clone 된 환경에서 `npm install` 또는 `npm ci` 가 한 번
  실행됐어야 함 (`tsx` 등이 node_modules 에 있어야 동작).

```bash
# 옵션 1: 인자로 전달 (실제 비밀번호는 .env.prod 의 DEFAULT_PASSWORD
# 또는 변경 후 값을 사용)
npm run smoke:prod -- \
  --base-url=http://<Tailscale-또는-LAN-IP> \
  --email=<시드-관리자-이메일> \
  --password=<시드-비밀번호>

# 옵션 2: 환경변수로 전달
SMOKE_BASE_URL=http://<Tailscale-또는-LAN-IP> \
SMOKE_EMAIL=<시드-관리자-이메일> \
SMOKE_PASSWORD=<시드-비밀번호> \
  npm run smoke:prod
```

기대 결과:
```
결과: 8 PASS / 0 FAIL
```

8 단계:
1. `GET /health`
2. `POST /auth/login` (HTTPS 환경이면 Secure 쿠키 검증까지)
3. `GET /auth/me`
4. `GET /system/health` (adapter=postgres, db.ok=true)
5. `GET /system/version`
6. `GET /notifications/unread-count`
7. `GET /search?q=한미르`
8. `POST /auth/logout`

⚠️ 첫 로그인 시 `must_change_password` 가 강제되므로, **스모크 계정의
비밀번호를 한 번 변경한 뒤** 변경된 값으로 다시 스모크하거나, 변경 후
값을 SMOKE_PASSWORD 에 반영. CI 등 자동화에 쓸 때는 전용 "스모크 계정"
하나를 별도 운영하는 게 깔끔.

### R-7. 백업 / 복원 — 실행 절차

#8 에서 운영 백업 스크립트와 복원 리허설 가이드가 추가됐다.

**파일**:
- `ops/backup/backup-prod.sh` — DB + uploads 묶음 백업 + retention.
  사람이 직접 호출해도 되고, cron 으로 매일 1회 등록해도 동작.
- `ops/backup/RESTORE_REHEARSAL.md` — 별도 VM 에서 7단계 복원 리허설.
  운영 긴급 복원 절차도 마지막 절에 포함.

#### 한 번 수동 실행 (가동 직후 검증)

```bash
cd /srv/hanmir-talk
sudo bash ./ops/backup/backup-prod.sh
ls -lh /srv/hanmir-talk/backups/$(ls -1t /srv/hanmir-talk/backups | head -1)
# db.sql.gz / uploads.tar.gz / manifest.txt 3개 파일과 합리적 크기 확인
```

> `bash` 명시 호출이 권장되는 이유: Windows 에서 clone 한 리포지토리는
> `core.filemode=false` 라 실행 비트(chmod +x)가 보존되지 않을 수 있어
> 직접 호출(`./ops/backup/backup-prod.sh`) 이 Permission denied 로 실패할
> 가능성이 있다. `bash <path>` 는 실행 비트가 없어도 동작한다. 편의상
> `chmod +x` 한 번 해두는 건 OK 지만 절차상 의존하지 말 것.

#### cron 등록 (운영 VM 의 root cron, 매일 02:30)

```cron
30 2 * * * cd /srv/hanmir-talk && BACKUP_ROOT=/srv/hanmir-talk/backups RETENTION_DAYS=14 bash ./ops/backup/backup-prod.sh >> /var/log/hanmir-talk-backup.log 2>&1
```

설치:
```bash
sudo crontab -e
# 위 한 줄 붙여넣고 저장
sudo touch /var/log/hanmir-talk-backup.log
sudo chmod 640 /var/log/hanmir-talk-backup.log
```

#### 백업 산출물 (한 세트당)

| 파일 | 내용 |
|---|---|
| `db.sql.gz` | `pg_dump --clean --if-exists --no-owner --no-acl` → gzip. 스키마+데이터 전체. `--clean --if-exists` 라 빈 컨테이너 부팅(initdb 마이그 적용된 상태) 위에 그대로 복원해도 충돌 없이 덮어쓴다 |
| `uploads.tar.gz` | `UPLOAD_DIR_HOST` 통째 tar.gz (디렉터리 이름 보존) |
| `manifest.txt` | 타임스탬프 / git commit / compose·env 파일명 / artifact 크기 |
| `.failed` | 실패 시 자동 생성되는 마커 (운영자 식별용) |

비밀번호·시크릿은 manifest 에 쓰지 않는다.

#### 보존 정책 (Retention)

- `RETENTION_DAYS=14` 기본 — 14일 경과한 타임스탬프 디렉터리 자동 삭제
- 안전 가드: `BACKUP_ROOT` 가 `/`·`/home`·`/etc` 등이면 삭제 단계 자체를
  거부 (스크립트 내장)
- **삭제 대상 패턴**: 스크립트가 `find ... -name "20??????-??????"` 로
  정확한 타임스탬프 형식(YYYYMMDD-HHMMSS) 디렉터리만 매칭한다.
- **영구 보관 방법**: 운영자가 디렉터리 이름을 `20260526-103045` →
  `20260526-103045-keep` 같이 suffix 를 붙여두면 위 패턴에 매치되지 않아
  retention 에서 자연스럽게 제외된다. 분기 1회 영구 보관 등에 사용.

#### 복원 리허설 주기

- **월 1회** 또는 **주요 릴리스(스키마 변경 포함) 직전** — 별도 VM
  (hanmir-dev 또는 일회용 restore VM) 에서 `RESTORE_REHEARSAL.md` 7단계
  + 성공 기준 체크리스트.
- "백업이 있어도 한 번도 복원해 보지 않으면 백업이 아니다" — 리허설
  결과를 운영 노트에 짧게라도 기록 (`pass`/`fail` + 일자).

#### Proxmox 스냅샷 (별개 안전망)

- 위 스크립트는 docker compose 데이터 백업.
- Proxmox 자체의 **VM 스냅샷 weekly** 도 병행 — VM 부팅 직전 상태 통째.
  Proxmox UI 또는 cron 으로 등록.

### R-8. 보안 경고 (운영 가동 직전 점검)

다음 항목들은 사고가 가장 잦은 실수다. 가동 전 반드시 확인.

- [ ] **`.env.prod` 커밋 금지** — `git check-ignore .env.prod` 가
      `.env.prod` 를 출력해야 정상. 출력이 비면 `.gitignore` 점검.
- [ ] **Postgres 포트 비공개** — `docker compose -f docker-compose.prod.yml ps`
      에서 postgres 의 PORTS 컬럼이 비어 있어야 함(컨테이너 내부 전용).
- [ ] **`DEFAULT_PASSWORD` 교체** — 운영 첫 가동 전 강한 값으로 변경.
      가동 직후 `/admin/status` 의 "초기 비밀번호 변경" 카드(#5)가 "완료"
      태그로 전환되었는지 직원 전체에게 안내·확인.
- [ ] **Tailscale ACL 제한** — Proxmox UI/SSH 가 Tailscale 의 admin
      tag 사용자만 접근 가능하도록 ACL 명시.
- [ ] **백업 = DB + uploads 둘 다** — 둘 중 하나만 백업하면 메시지 첨부
      파일이 죽거나 메타데이터만 살아남는다. 항상 같은 시점·같은 세트로.
- [ ] **HTTP 운영은 1·2단계 한정** — Phase 3 직원 전체 사용 전에는
      반드시 HTTPS 로 전환. 평문 HTTP 로 외부 직원에게 배포 금지.
- [ ] **VAPID/Web Push 는 HTTPS 필수** — Phase 1·2 에선 자연스럽게 비활성.
      Phase 3 도메인 적용 시 함께 `npx tsx server/scripts/generate-vapid.ts`
      로 키 생성 후 `.env.prod` 에 반영.
- [ ] **운영/개발 .env 분리 유지** — dev 는 `.env`, 운영은 `.env.prod`.
      서로 섞어서 dev 모드에서 운영 secret 이 콘솔에 나오지 않도록.

### R-9. (Phase 3) 도메인 + HTTPS 전환 — 외부 의존성

본 단계는 R-0 의 Phase 3 진입 조건. **사내 IT 와 DNS/인증서 협의가
끝난 시점에 별도로 수행** — 여기 코드/문서를 미리 만들지 말고, 이행 시점에
다음만 변경하면 끝나도록 설계되어 있다.

1. `.env.prod` 의 `PUBLIC_ORIGIN` 을 `https://<도메인>` 으로 변경.
   - server 가 자동으로 Secure 쿠키 부착으로 전환.
2. `Caddyfile` 상단의 `:80` 사이트 블록을 도메인 블록으로 교체.
   - 인터넷 도달 가능 도메인 → Caddy 자동 LE 발급
   - 사내 자체 CA → `tls /path/fullchain.pem /path/privkey.pem` 마운트
3. `docker-compose.prod.yml` 의 caddy 서비스에 `"443:443"` 포트 추가, 인증서
   디렉터리를 bind mount.
4. `docker compose -f docker-compose.prod.yml up -d caddy` 로 caddy 만 재기동
   (web/server 재빌드 불필요 — API base URL 이 상대경로).
5. PWA install 안내 + Web Push VAPID 키 생성·등록(`.env.prod` 의 VAPID_*
   섹션 채우기 + 컨테이너 재기동).
6. 외부 도메인을 쓰는 경우 사용자(직원) 가 처음 접속할 때 PWA 설치 안내.
7. 스모크 재실행 — `npm run smoke:prod` 이 Secure 쿠키 플래그까지 검증.
