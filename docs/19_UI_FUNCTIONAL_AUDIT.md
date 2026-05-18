# 19. UI 비동작 요소 감사 및 후속 작업 계획

> 작성일: 2026-05-18
> 범위: `apps/web/src/` 전체 — 클릭/입력해도 실제로 아무 일이 일어나지 않는 모든 UI 요소
> 이미 동작하는 요소(프로젝트/업무/공지/제품 CRUD, 파일 업로드, 메시지 첨부·핀·읽음, 실시간 push 등)는 제외

---

## 1. 한눈에 보는 현황

| 구분 | 갯수 |
| --- | --- |
| 전체 비동작 요소 | **약 60개** |
| 백엔드는 있으나 UI 미연결 | 0개 (지난 세션에 모두 연결 완료) |
| 백엔드까지 새로 구현해야 함 | 약 25개 |
| 프론트 토글/필터/검색만으로 해결 가능 | 약 20개 |
| 새 라우트/모달이 필요한 진입점 | 약 10개 |
| 시각적 스텁 (없어도 무방, 제거 후보) | 약 5개 |

---

## 2. 위치별 비동작 요소

### 2.1 채팅 — `/chat`, `/chat/[roomId]`

| 위치 | 요소 | 현 상태 | 해결 방향 | 백엔드 필요 |
| --- | --- | --- | --- | --- |
| `components/chat/ChatList.tsx:28` | `+ 새 채팅` IconButton | 핸들러 없음 | DM/채팅방 생성 모달 | ✅ POST /rooms |
| `components/chat/ChatList.tsx:34-43` | `전체 / 읽지 않음 / 고정 / 멘션` 필터 pill | hardcoded count (24/12/3), 클릭 무효 | useState 필터 + 리스트 분기 | — |
| `chat/[roomId]/page.tsx:90` | 헤더 `멤버` IconButton | 핸들러 없음 | RoomInfoPane 토글 또는 멤버 모달 | — |
| `chat/[roomId]/page.tsx:93` | 헤더 `고정` IconButton | 핸들러 없음 | 핀 메시지 목록 popover (단일 핀은 이미 배너로 노출되므로 우선순위 낮음) | — |
| `chat/[roomId]/page.tsx:96` | 헤더 `더보기` IconButton | 핸들러 없음 | 채팅방 메뉴 (음소거, 나가기, 설정) | ✅ mute, leave |
| `components/chat/MessageComposer.tsx` 굵게·기울임·목록·멘션·이모지·업무만들기 6개 버튼 | 핸들러 없음 | 마크다운 또는 멘션/이모지 picker | 일부 (멘션 lookup) |
| `components/chat/MessageComposer.tsx` `예약 전송` | 핸들러 없음 | 시간 선택 + 스케줄 큐 | ✅ POST /messages/schedule |

### 2.2 파일함 — `/files`

| 위치 | 요소 | 현 상태 | 해결 방향 | 백엔드 필요 |
| --- | --- | --- | --- | --- |
| `files/page.tsx` 좌측 사이드바 전체 (전체/최근/즐겨찾기/내가 공유/개인보관함 + 프로젝트 3개 + 부서 5개 + 유형 4개) | 클릭 무효, count 전부 하드코딩 | scope 필터 state + listFiles 호출에 query 전달 | 일부 (개인보관함, 즐겨찾기는 신규) |
| `files/page.tsx` 브레드크럼 `<a href="#">파일함</a>` | placeholder | `/files` Link로 교체 | — |
| `files/page.tsx` `목록 / 카드 / 상세` 뷰 토글 | 무효 | useState 토글 + 분기 렌더 | — |
| `files/page.tsx` `유형 / 소유자 / 기간 / 정렬` 필터 4개 | 무효 | 드롭다운 + 필터 state | — |
| `files/page.tsx` 파일 검색 input | onChange 없음 | useState + debounce + listFiles 호출 | (선택) 서버 search |
| `files/page.tsx` 폴더 카드 `⋯` 메뉴 | 무효 | 메뉴 popover (이름 변경, 삭제, 권한) | ✅ folder CRUD (전체 신규) |
| `files/page.tsx` 파일 행 `더보기` IconButton | 무효 | 메뉴 popover (이름 변경, 삭제, 공유) | DELETE만 있음, rename/share 신규 |
| `files/page.tsx` `새 폴더` 버튼 | (이미 제거됨 — 무시) | — | — |

### 2.3 업무 — `/projects/[id]/tasks`

| 위치 | 요소 | 현 상태 | 해결 방향 | 백엔드 필요 |
| --- | --- | --- | --- | --- |
| `tasks/page.tsx:51-62` | `목록 / 보드 / 타임라인 / 표` 뷰 토글 | 무효, 목록만 동작 | 뷰 컴포넌트 분기 (보드 = Kanban, 표 = CSV-like) | — |
| `tasks/page.tsx:42` | `CSV 내보내기` | 무효 | 클라이언트에서 CSV 생성 후 다운로드 | — |
| `tasks/page.tsx:65-67` | `담당자 / 상태 / 우선순위 / 정렬` 필터 4개 | 무효 | 드롭다운 + 클라이언트 필터 | — |
| `tasks/page.tsx:70-72` | 업무 검색 input | onChange 없음 | useState + 클라이언트 필터 | — |
| `tasks/page.tsx` 완료 그룹 `ChevronDownIcon` | 무효, "접힌 그룹" 텍스트만 | useState 토글 + 완료 task list 렌더 | — |

### 2.4 프로젝트 — `/projects/[id]`, `/projects/[id]/gantt`

| 위치 | 요소 | 현 상태 | 해결 방향 | 백엔드 필요 |
| --- | --- | --- | --- | --- |
| `projects/[id]/page.tsx` 프로젝트 개요 카드 `✎` 편집 | 무효 (헤더의 `수정` 액션이 이미 있어 중복) | 제거 또는 인라인 편집 트리거로 변경 | — |
| `components/project/ProjectHeader.tsx` 기본 `즐겨찾기 / 상태 변경 / + 업무 추가` 폴백 액션 | 무효 (각 페이지가 rightActions override 시 OK, 그 외 폴백 경로에서 표시) | 폴백 자체를 빈 노드로 바꾸고 의미 있는 버튼만 노출 | (즐겨찾기는 신규) |
| `components/project/ProjectHeader.tsx` `결정 기록`, `설정` 탭 | href 없음 → `<span>` | 결정 기록 라우트 신설 또는 탭 제거. 설정도 별도 라우트 | ✅ decisions CRUD |
| `gantt/page.tsx:139-140` | `PDF 내보내기` | 무효 | 클라이언트 PDF (예: jsPDF) | — |
| `gantt/page.tsx:142-144` | `+ 일정 추가` | 무효 | 마일스톤/태스크 추가 모달 (TaskCreateModal 재사용) | — |
| `gantt/page.tsx:150-162` | `일/주/월/분기` 타임스케일 토글 | 무효 | useState + 컬럼 너비 분기 | — |
| `gantt/page.tsx:164-171` | `기간/담당자/상태` 필터 3개 | 무효 | 드롭다운 + 필터 | — |

### 2.5 제품 — `/products/[id]`

| 위치 | 요소 | 현 상태 | 해결 방향 | 백엔드 필요 |
| --- | --- | --- | --- | --- |
| `products/[id]/page.tsx:107-109` | `변경 이력 →` | 무효 | 영업 상태 변경 이력 모달/페이지 | ✅ sales_status_events 테이블 + API |
| `products/[id]/page.tsx:112-119` | 6개 탭 (제품 개요/시험성적서/생산 LOT/영업 상태 이력/관련 프로젝트/문의 채팅) | 비활성 div, 클릭 무효 | 탭 state + 섹션 분기, 또는 별도 라우트 | 일부 (LOT, 시험성적서 etc.) |
| `products/[id]/page.tsx:128-129` | `전체 이력 보기 →` link | `href="#"` | 이력 페이지 라우팅 | ✅ |
| `products/[id]/page.tsx:165-167` | 제품 사양 섹션 `수정` | 무효 | 사양 편집 모달 (ProductFormModal 확장 또는 별도) | ✅ product_specs 테이블 |
| `products/[id]/page.tsx:187-189` | `전체 LOT →` | 무효 | LOT 목록 페이지 | ✅ product_lots |
| `products/[id]/page.tsx:295-297` | `1:1 대화 시작` | 무효 | 담당자와 DM 방 찾기/생성 | ✅ DM 생성 |

### 2.6 관리자 — `/admin`

| 위치 | 요소 | 현 상태 | 해결 방향 | 백엔드 필요 |
| --- | --- | --- | --- | --- |
| `admin/page.tsx` 좌측 nav `권한/역할` | "준비중" 뱃지 | per-role 권한 매트릭스 페이지 | ✅ 정책 모델 정립 |
| 같은 위치 `초대/가입 승인` | "준비중" | 초대 API + 가입 워크플로 | ✅ 신규 큰 작업 |
| 같은 위치 `보안/로그인` | "준비중" | 정책 설정 화면 | (현행 정책은 코드 상수) |
| 같은 위치 `알림 정책` | "준비중" | 사용자/팀별 알림 설정 | ✅ |
| 같은 위치 `서비스 상태`, `버전/업데이트` | "준비중" | health/version 페이지 | ✅ 단순 endpoint |
| `admin/page.tsx` 감사 로그 카드 `전체 보기는 추후 추가` 안내 | (대체 텍스트) | 감사 로그 전용 페이지 | ✅ 영속 audit log |

### 2.7 대시보드 / Topbar / Sidebar

| 위치 | 요소 | 현 상태 | 해결 방향 | 백엔드 필요 |
| --- | --- | --- | --- | --- |
| `components/shell/Topbar.tsx` 사용자 이름/부서 | **하드코딩 "김민준 / 생산기술팀 · 책임"** | `/auth/me` 결과를 client component로 받아 표시 | — |
| `components/shell/Topbar.tsx` 알림 dot | 항상 표시 | 실제 unread notice count로 분기 | — |
| `components/shell/Topbar.tsx` 검색 form | `/chat?q=` 로 GET만 | `/chat`이 `?q=` 처리하도록 + 글로벌 검색 페이지 | ✅ 검색 API |
| `components/shell/Sidebar.tsx:84` | `설정` 버튼 | 무효 | 사용자 설정 페이지 (`/settings`) | (개인 환경설정 모델) |
| `components/chat/RoomInfoPane.tsx` 닫기 / 프로젝트 페이지 열기 등 | 무효 | 부모에서 토글 상태 관리 + 라우팅 | — |

### 2.8 시각/문구 스텁 (제거 또는 placeholder 명시)

| 위치 | 요소 | 권장 |
| --- | --- | --- |
| `/chat/page.tsx` 상단 요약 카드의 하드코딩 숫자 | 실 데이터 바인딩 |
| `/files` 사이드바 카운트 전부 (842, 28, 12, 36, 14, 42 등) | 실 데이터 바인딩 또는 표시 제거 |
| `MessageComposer` 포맷팅 버튼 6개 | 일단 제거 후 마크다운 도입 시 재추가 |

---

## 3. 카테고리별 묶음 (한 번에 처리하면 효율적)

### Group A — UI 토글/필터만 (백엔드 0)
> `/files` 사이드바 scope, `/tasks` 뷰·필터·검색, `/gantt` 타임스케일·필터, 완료 그룹 접기, `/chat` ChatList 필터 pill, `/files` 뷰 모드·필터·검색
- 전부 useState 기반, 작업량 합쳐도 **반나절~1일**
- ROI 매우 높음 — 사용자 체감 클릭률 가장 큼

### Group B — 채팅방 운영
> `+ 새 채팅` 모달, 헤더 `멤버 / 더보기` 메뉴, 채팅방 음소거/나가기, 1:1 DM 생성, 검색
- 백엔드: `POST /rooms`, `PATCH /rooms/:id/members`, `PATCH /rooms/:id/mute`, `DELETE /rooms/:id/members/me`
- 작업량 **2-3일** (백엔드 + UI)

### Group C — 제품 부속 (LOT / 사양 / 시험성적서 / 영업 이력)
> `/products/[id]` 탭 5개, `전체 LOT`, `변경 이력`, `1:1 대화 시작`
- 스키마: `product_lots`, `product_specs`, `sales_status_events`, `product_documents` (마이그레이션 006)
- 작업량 **3-5일** — 가장 비용 큼

### Group D — 결정 기록 + 프로젝트 설정 페이지
> `ProjectHeader` 탭 `결정 기록`, `설정`
- 백엔드: `decisions` 테이블 + CRUD
- 작업량 **2일**

### Group E — 관리자 영역 확장
> `/admin` 좌측 nav "준비중" 5개 항목
- 권한/역할 / 초대 / 보안정책 / 알림정책 / 감사로그 페이지
- 작업량 **3-5일** (감사 로그 영속화가 가장 큼)

### Group F — 데이터 바인딩 정리
> `/chat/page.tsx` 요약 카드, `/files` 사이드바 카운트, Topbar 사용자 이름·알림 dot
- 작업량 **반나절** (이미 있는 데이터를 binding만)

### Group G — 고급 메시지 입력
> 굵게·기울임·목록·멘션·이모지·예약 전송
- 작업량 **L급 (1주+)** — 마크다운 에디터 도입 필요. 우선순위 가장 낮음

---

## 4. 권장 작업 순서

운영 배포 전 보안/인프라(이미 별도 TODO)를 제외하고, UI/UX 측면에서는 다음 순서를 권장합니다.

1. **Group A (UI 토글/필터)** — 0.5~1일. 가장 짧은 시간에 사용자 체감이 가장 큰 영역
2. **Group F (데이터 바인딩 정리)** — 0.5일. Topbar 사용자명 하드코딩은 특히 빨리 고치는 게 좋음
3. **Group B (채팅방 운영)** — 2-3일. 회사 메신저로서 핵심
4. **Group D (결정 기록 + 프로젝트 설정)** — 2일. 프로젝트 화면 완결성
5. **Group C (제품 부속)** — 3-5일. 영업 워크플로 완성
6. **Group E (관리자 확장)** — 3-5일. 그 중 감사 로그 영속화 1순위
7. **Group G (메시지 에디터)** — 후순위. 마크다운 도입 결정 후

전체 ~ **2-3주** (1인 풀타임 기준).

---

## 5. 우선순위 매트릭스 (영향 vs 비용)

| 그룹 | 사용자 체감 | 백엔드 비용 | 권장 시점 |
| --- | --- | --- | --- |
| A. UI 토글/필터 | 🔥🔥🔥 | 없음 | **즉시** |
| F. 데이터 바인딩 | 🔥🔥 | 없음 | **즉시** |
| B. 채팅방 운영 | 🔥🔥🔥 | 중 | 다음 스프린트 |
| D. 결정 기록/설정 | 🔥🔥 | 중 | 다음 스프린트 |
| C. 제품 부속 | 🔥🔥 | 큼 | 그 다음 |
| E. 관리자 확장 | 🔥 (관리자만) | 큼 | 그 다음 |
| G. 메시지 에디터 | 🔥 | 큼 | 마지막 |

---

## 6. 절대 잊지 말 것

- **Topbar 하드코딩 "김민준 / 생산기술팀 · 책임"** → 다른 사용자로 로그인해도 김민준으로 보이는 상태. F그룹에서 가장 먼저 처리 권장.
- **`/admin` 사용자 카드의 `+ 사용자 추가` 시 비밀번호** → 현재 `DEFAULT_PASSWORD` 공용. UI에서 password 필드는 받지도 않음. bcrypt 도입(별도 보안 TODO)과 같이 처리.
- **`/files` 사이드바 카운트의 더미 숫자 842 / 28 / 12 / 36 등** → 실제로는 백엔드 데이터 카운트와 무관. 운영 환경에서 사용자 혼란 유발 가능 — 데이터 연동 전에는 차라리 숫자 제거 권장.

---

## 7. 본 문서 갱신 정책

- 작업이 완료된 항목은 "✅" 처리 후 commit message에 본 문서 ID(`19_UI_FUNCTIONAL_AUDIT`) 참조.
- 새로 발견되는 스텁은 본 문서에 추가 후 동일 문서를 단일 소스로 유지.
