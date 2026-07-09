# 08. Backend API 명세

갱신일: 2026-06-10 · 소스: `server/src/routes` (라우트 마운트는 `server/src/app.ts`)

Base URL: `/api/v1`

## 인증/권한 표기

- 모든 라우터는 `/auth`와 `/health`를 제외하고 `requireAuth`가 적용된다 (httpOnly 쿠키 또는 Bearer 토큰).
- **공개**: 인증 불필요
- **인증**: 로그인한 모든 사용자
- **admin**: `admin` 또는 `super_admin` 역할 전용
- **writer**: `admin` / `super_admin` / `manager` / `project_owner`
- 채팅방·프로젝트 단위 자원은 권한 역할과 별개로 **멤버십 검사**를 추가로 수행한다 (비멤버는 404). admin은 멤버십 검사를 우회한다.

## Health

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/health` | 서버 생존 확인 | 공개 |

## Auth

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| POST | `/auth/login` | 로그인 (id 또는 email + password) | 공개 |
| POST | `/auth/logout` | 로그아웃 + 토큰 폐기 | 공개 |
| POST | `/auth/refresh` | refresh 쿠키 검증 + 회전 발급 | 공개 |
| GET | `/auth/me` | 내 정보 | 인증 |
| POST | `/auth/change-password` | 비밀번호 변경 (현재 비밀번호 확인) | 인증 |
| GET | `/auth/invitation/:token` | 초대 토큰 미리보기 | 공개 |
| POST | `/auth/accept-invite` | 초대 수락 → 계정 생성 | 공개 |

## Users

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/users` | 사용자 목록 | 인증 |
| GET | `/users/:id` | 사용자 상세 | 인증 |
| POST | `/users` | 사용자 생성 | admin |
| PATCH | `/users/:id` | 사용자 수정 | admin |
| PATCH | `/users/:id/deactivate` | 사용자 비활성화 | admin |

## Departments

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/departments` | 부서 목록 | 인증 |
| POST | `/departments` | 부서 생성 | admin |
| PATCH | `/departments/:id` | 부서 수정 | admin |
| DELETE | `/departments/:id` | 부서 삭제 | admin |

## Rooms (채팅방)

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/rooms` | 내가 멤버인 방 목록 (admin은 전체) | 인증 |
| POST | `/rooms` | 방 생성 (생성자가 owner, projectId 지정 시 프로젝트 멤버 검사) | 인증 |
| POST | `/rooms/direct` | 1:1 DM 방 find-or-create (idempotent) | 인증 |
| GET | `/rooms/:id` | 방 상세 | 방 멤버 |
| PATCH | `/rooms/:id` | 방 이름/설명 수정 | 방 멤버 |
| GET | `/rooms/:roomId/messages` | 메시지 목록 (top-level + 스레드 요약) | 방 멤버 |
| POST | `/rooms/:roomId/messages` | 메시지 전송 (첨부/entities/AI 플래그 지원) | 방 멤버 |
| POST | `/rooms/:roomId/read` | 방 단위 읽음 마킹 (`lastMessageId`) | 방 멤버 |
| GET | `/rooms/:roomId/files` | 방 공유파일 목록 (메시지 첨부, `?limit=&offset=` → `{rows, total}`, uploaderName 포함) | 방 멤버 |
| GET | `/rooms/:roomId/pinned` | 고정 메시지 조회 (없으면 204) | 방 멤버 |
| POST | `/rooms/:roomId/pin` | 메시지 고정 (방당 1개, 교체) | 방 멤버 |
| DELETE | `/rooms/:roomId/pin` | 고정 해제 | 방 멤버 |
| POST | `/rooms/:roomId/members` | 멤버 추가 (direct 방 불가) | 방 멤버 |
| DELETE | `/rooms/:roomId/members/:userId` | 멤버 제거 — 본인 또는 admin만 | 본인/admin |
| POST | `/rooms/:roomId/mute` | 방 알림 음소거 (본인) | 방 멤버 |
| DELETE | `/rooms/:roomId/mute` | 음소거 해제 (본인) | 방 멤버 |
| POST | `/rooms/:roomId/leave` | 방 나가기 (마지막 멤버면 soft archive, direct 불가) | 방 멤버 |

## Messages

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/messages/search?q=&roomId=&limit=` | 메시지 검색 (내 멤버 방 스코프, 2자 이상) | 인증 |
| GET | `/messages/:id/replies` | 스레드 답글 목록 | 방 멤버 |
| POST | `/messages/:id/replies` | 스레드 답글 작성 (깊이 1만 지원) | 방 멤버 |
| PUT | `/messages/:id/reactions/:emoji` | 이모지 반응 추가 (화이트리스트 6종: 👍✅🙏🎉👀📌) | 방 멤버 |
| DELETE | `/messages/:id/reactions/:emoji` | 이모지 반응 제거 | 방 멤버 |
| PATCH | `/messages/:id` | 메시지 수정 | 작성자 본인 |
| DELETE | `/messages/:id` | 메시지 soft delete | 작성자/admin |
| POST | `/messages/schedule` | 예약 전송 생성 (`roomId`, `content`, `scheduledAt`) | 방 멤버 |
| GET | `/messages/scheduled?roomId=` | 내 예약 목록 (sent/cancelled 제외) | 인증 |
| DELETE | `/messages/scheduled/:id` | 예약 취소 | 작성자/admin |
| POST | `/messages/:messageId/create-decision` | 메시지 → 결정사항 변환 (프로젝트방 메시지만) | writer + 프로젝트 멤버 |

## Mentions

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/mentions/search?q=&scope=&limit=` | `@` 팝오버 통합 검색 (scope: user/department/project/task/file) | 인증 |

## Projects / Tasks

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/projects` | 프로젝트 목록 | 인증 |
| GET | `/projects/:id` | 프로젝트 상세 | 인증 |
| POST | `/projects` | 프로젝트 생성 | writer |
| PATCH | `/projects/:id` | 프로젝트 수정 | writer |
| DELETE | `/projects/:id` | 프로젝트 삭제 | writer |
| POST | `/projects/:id/members` | 멤버 추가 | writer |
| DELETE | `/projects/:id/members/:userId` | 멤버 제거 | writer |
| GET | `/projects/:projectId/tasks` | 프로젝트 업무 목록 | 인증 |
| POST | `/projects/:projectId/tasks` | 업무 생성 | writer |
| GET | `/tasks/:id` | 업무 상세 | 인증 |
| PATCH | `/tasks/:id` | 업무 수정 | writer |
| DELETE | `/tasks/:id` | 업무 삭제 | writer |

## Decisions (결정사항)

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/projects/:projectId/decisions` | 결정사항 목록 | 프로젝트 멤버 |
| POST | `/projects/:projectId/decisions` | 결정사항 생성 | writer + 프로젝트 멤버 |
| GET | `/decisions/:id` | 결정사항 상세 | 프로젝트 멤버 |
| PATCH | `/decisions/:id` | 수정 — writer 역할이면서 기록자 본인 또는 admin | writer(기록자/admin) |
| DELETE | `/decisions/:id` | soft delete | 기록자/admin |
| POST | `/decisions/:id/confirm` | 확인 처리 (개인별) | 프로젝트 멤버 |
| GET | `/decisions/:id/read-status` | 확인 현황 | 기록자/admin |

## AI 명령

모두 `{ roomId, scope }` 입력, 결과는 미리보기용 — 자동 전송 없음.
scope: `recent20` / `today` / `thread` / `messageIds`. 사용자별 rate limit: 5회/분, 30회/일 + 일일 토큰 상한.

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| POST | `/ai/chat-summary` | `/요약` — 대화 요약 | 방 멤버 |
| POST | `/ai/extract-tasks` | `/업무추출` — 업무 후보 추출 | 방 멤버 |
| POST | `/ai/extract-decisions` | `/결정사항` — 결정사항 후보 추출 | 방 멤버 |
| POST | `/ai/draft-notice` | `/공지초안` — 공지 초안 작성 | 방 멤버 |
| POST | `/ai/minutes` | `/회의록` — 회의록 형식 변환 | 방 멤버 |

## Products (제품 정보)

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/products` | 제품 목록 | 인증 |
| GET | `/products/:id` | 제품 상세 | 인증 |
| POST | `/products` | 제품 생성 | writer |
| PATCH | `/products/:id` | 제품 수정 (salesStatus 변경 시 이력 자동 기록) | writer |
| DELETE | `/products/:id` | 제품 삭제 | writer |
| GET | `/products/:id/specs` | 사양(key-value) 목록 | 인증 |
| POST | `/products/:id/specs` | 사양 추가(upsert) | writer |
| PATCH | `/products/:id/specs/:specId` | 사양 수정 | writer |
| DELETE | `/products/:id/specs/:specId` | 사양 삭제 | writer |
| GET | `/products/:id/lots` | 생산 LOT 목록 | 인증 |
| POST | `/products/:id/lots` | LOT 등록 (lot 번호 제품 내 중복 불가) | writer |
| PATCH | `/products/:id/lots/:lotId` | LOT 수정 | writer |
| DELETE | `/products/:id/lots/:lotId` | LOT 삭제 | writer |
| GET | `/products/:id/sales-history` | 영업 상태 변경 이력 | 인증 |
| GET | `/products/:id/documents` | 제품 문서 목록 | 인증 |
| POST | `/products/:id/documents` | 제품 문서 연결 | writer |
| DELETE | `/products/:id/documents/:docId` | 제품 문서 삭제 | writer |

## ERP (재고/전표)

상세 개념은 `23_ERP_INVENTORY_SPEC.md` 참고.

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/erp/variants?productId=` | 제품 규격 목록 | 인증 |
| POST | `/erp/variants` | 규격 생성 | admin |
| PATCH | `/erp/variants/:id` | 규격 수정 | admin |
| GET | `/erp/warehouses` | 창고 목록 | 인증 |
| POST | `/erp/warehouses` | 창고 생성 | admin |
| PATCH | `/erp/warehouses/:id` | 창고 수정 | admin |
| GET | `/erp/inventory?productId=&warehouseId=` | (규격×창고) 현재고 | 인증 |
| GET | `/erp/inventory/summary?productId=` | 제품 단위 규격별 + 총 kg 요약 | 인증 |
| GET | `/erp/inventory/transactions` | 입출고/조정 이력 (필터: product/variant/warehouse/from/to/limit) | 인증 |
| POST | `/erp/inventory/import` | 초기 재고/조정 일괄 등록 | admin |
| GET | `/erp/documents` | 전표 목록 (필터: from/to/type/customer/status/limit) | 인증 |
| GET | `/erp/documents/:id` | 전표 상세 (라인 포함) | 인증 |
| POST | `/erp/documents` | 전표 저장 + 재고 즉시 차감. 재고 부족 시 409, 음수 허용은 admin + `allowNegative` | 인증 |
| POST | `/erp/documents/:id/cancel` | 전표 취소 + 재고 복원 | 인증 |
| GET | `/erp/mes/mappings?productId=` | MES 매핑 목록 | 인증 |
| POST | `/erp/mes/mappings` | MES 매핑 생성 | admin |
| PATCH | `/erp/mes/mappings/:id` | MES 매핑 수정 | admin |
| GET | `/erp/mes/sync-runs?limit=` | MES 동기화 실행 이력 | 인증 |
| GET | `/erp/exports/inventory` | 현재고 CSV 다운로드 | 인증 |
| GET | `/erp/exports/documents` | 전표 목록 CSV 다운로드 | 인증 |

## Files

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/files` | 파일 목록 (필터: projectId/productId/taskId/messageId/uploaderId) — direct(1:1) 방 첨부는 제외 | 인증 |
| GET | `/files/folders` | 폴더(분류) 목록 | 인증 |
| POST | `/files/upload` | multipart 업로드 (확장자/MIME/크기 검사) | 인증 |
| GET | `/files/:id` | 파일 메타 | 인증 |
| GET | `/files/:id/download` | 파일 다운로드 — direct 방 첨부는 방 멤버/admin만 (403 not_room_member) | 인증 |
| DELETE | `/files/:id` | 파일 삭제 (디스크 + 메타) | 인증 |

## Notices

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/notices` | 공지 목록 (내 확인 여부 포함) | 인증 |
| POST | `/notices` | 공지 작성 | admin |
| GET | `/notices/:id` | 공지 상세 | 인증 |
| GET | `/notices/:id/read-status` | 확인자/미확인자 현황 | admin |
| POST | `/notices/:id/confirm` | 공지 확인 처리 | 인증 |

## Dashboard

`GET /dashboard/overview` 통합형 — KPI + 감사 로그(최근 20건) + 부서 통계 + activities 를 한 번에 반환한다.

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/dashboard/overview` | KPI/감사/부서 통계 통합 응답 | admin |
| GET | `/dashboard/admin-kpis` | 관리자 KPI만 | admin |
| GET | `/dashboard/audit?limit=&action=&actorUserId=` | 감사 로그 (대시보드용) | admin |
| GET | `/dashboard/dept-stats` | 부서별 통계 | admin |
| GET | `/dashboard/activities` | 개인 활동 피드 (실 테이블 도입 전 — 현재 빈 배열) | 인증 |
| GET | `/dashboard/project-activities` | 프로젝트 활동 피드 (현재 빈 배열) | 인증 |

## Invitations (초대)

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/invitations` | 초대 목록 | admin |
| POST | `/invitations` | 초대 발급 (email + role + departmentId) | admin |
| DELETE | `/invitations/:id` | 초대 취소 | admin |

수락 플로우는 비인증 엔드포인트 `GET /auth/invitation/:token`, `POST /auth/accept-invite` 사용.

## Search (통합 검색)

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/search?q=&scope=` | 메시지/파일/프로젝트/제품 통합 검색 (scope: all/messages/files/projects/products, 도메인당 20건) | 인증 |

## Notifications

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/notifications?unread=&limit=` | 내 알림 inbox | 인증(본인) |
| GET | `/notifications/unread-count` | 미확인 알림 수 | 인증(본인) |
| POST | `/notifications/:id/read` | 개별 읽음 처리 | 인증(본인) |
| POST | `/notifications/read-all` | 모두 읽음 처리 | 인증(본인) |
| GET | `/notification-settings` | 내 알림 설정 | 인증(본인) |
| PATCH | `/notification-settings` | 알림 설정 수정 (전체/방별/프로젝트별/푸시) | 인증(본인) |
| GET | `/org-notification-defaults` | 조직 기본 알림 설정 | admin |
| PATCH | `/org-notification-defaults/:category` | 카테고리별 기본값 수정 | admin |
| GET | `/push-subscriptions/vapid-public-key` | VAPID 공개 키 | 인증 |
| POST | `/push-subscriptions` | Web Push 구독 등록 | 인증(본인) |
| DELETE | `/push-subscriptions` | 구독 해제 | 인증(본인) |

## Audit / System

| 메서드 | 경로 | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/audit?limit=&action=&actorUserId=` | 감사 로그 조회 | admin |
| GET | `/system/health` | 어댑터 모드 + DB 상태 | admin |
| GET | `/system/version` | 서버 버전 정보 | admin |
| GET | `/system/security-policy` | 적용 중인 보안 정책 값 | admin |

## WebSocket 이벤트 (Socket.IO)

연결 시 `user:<userId>` 채널 자동 join. 방/프로젝트 채널은 멤버십 검증 후 join.

Client → Server:

- `room:join` / `room:leave`
- `project:join` / `project:leave`

Server → Client:

- `message:new` / `message:updated` / `message:deleted`
- `message:reply:new` / `message:reply:updated` / `message:reply:deleted` / `message:thread:updated`
- `message:reaction:updated`
- `room:pin` / `room:created` / `room:updated` / `room:membership`
- `decision:new` / `decision:updated` / `decision:deleted`
- `notice:new`
- `notification:new`
