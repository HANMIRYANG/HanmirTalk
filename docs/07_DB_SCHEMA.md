# 07. DB 스키마

> 이 문서는 `server/src/db/schema.sql` + `server/src/db/migrations/*.sql`(001~022)를 기준으로 한 **최종 스키마 스냅샷**이다. 마이그레이션이 초기 정의를 변경한 경우(예: 004에서 `notices.room_id` nullable 전환) 최종 상태를 반영했다. **갱신일: 2026-06-10**

DB는 PostgreSQL 기준으로 설계한다.

공통 규약:

- 모든 id는 UUID. 기본값 `gen_random_uuid()` (`pgcrypto` 확장 필요).
- soft delete가 필요한 곳은 `is_active` 또는 `is_deleted` 컬럼 사용. hard delete는 참조 종속이 없는 객체에만 허용.
- 감사 컬럼 `created_at`, `updated_at`은 `NOW()` 기본값.
- 사용 확장: `pgcrypto`(UUID 생성), `pg_trgm`(메시지 ILIKE 검색 가속, 011).
- 시퀀스: `erp_doc_seq` — ERP 전표번호 전역 연번 채번용 (021).

---

## 1. 조직 / 사용자

### departments

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| name | VARCHAR(100) | NOT NULL |
| description | TEXT | |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

### users

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| name | VARCHAR(100) | NOT NULL |
| phone | VARCHAR(30) | |
| email | VARCHAR(255) | NOT NULL, UNIQUE |
| password_hash | TEXT | NOT NULL — bcryptjs 해시 (006) |
| department_id | UUID | FK → departments(id) ON DELETE SET NULL |
| position | VARCHAR(100) | |
| role | VARCHAR(50) | NOT NULL DEFAULT 'member' (member/manager/admin/super_admin) |
| profile_image_url | TEXT | |
| avatar_tone | VARCHAR(20) | 아바타 색상 (default/orange/green/purple/gray) |
| initials | VARCHAR(10) | 아바타 이니셜 |
| must_change_password | BOOLEAN | NOT NULL DEFAULT false — 첫 로그인 시 비밀번호 변경 강제 (007) |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `idx_users_department` — (department_id)

시드(003): 부서 12개 + 사용자 22명을 고정 UUID로 삽입. 초기 비밀번호는 공용 값이며 006(bcrypt 일괄 교체) → 007(must_change_password=true)로 후처리된다.

---

## 2. 메신저 (rooms / messages / reactions / scheduled_messages)

### rooms

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| name | VARCHAR(150) | NOT NULL |
| type | VARCHAR(50) | NOT NULL |
| description | TEXT | |
| project_id | UUID | (FK 미지정 — 논리 참조) |
| created_by | UUID | NOT NULL, FK → users(id) |
| pinned_message_id | UUID | FK → messages(id) ON DELETE SET NULL — 방당 고정 메시지 1개 (005) |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

### room_members

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| room_id | UUID | NOT NULL, FK → rooms(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| role | VARCHAR(50) | NOT NULL DEFAULT 'member' |
| last_read_message_id | UUID | 읽음 추적 포인터 |
| notification_enabled | BOOLEAN | NOT NULL DEFAULT true |
| joined_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

제약: `UNIQUE (room_id, user_id)`

### messages

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| room_id | UUID | NOT NULL, FK → rooms(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → users(id) |
| content | TEXT | |
| message_type | VARCHAR(50) | NOT NULL DEFAULT 'text' |
| parent_message_id | UUID | FK → messages(id) — 스레드 답글 부모 (019에서 활용) |
| related_task_id | UUID | (논리 참조) |
| related_decision_id | UUID | (논리 참조) |
| is_deleted | BOOLEAN | NOT NULL DEFAULT false — soft delete |
| edited_at | TIMESTAMP | NULL — 본문 수정 시각, "수정됨" 표시용 (010) |
| content_tsv | tsvector | GENERATED ALWAYS AS to_tsvector('simple', content) STORED (011) |
| entities | JSONB | NOT NULL DEFAULT '[]' — 멘션/참조 토큰 배열 (013) |
| ai_generated | BOOLEAN | NOT NULL DEFAULT false — AI 초안 여부 (013) |
| ai_command | VARCHAR(40) | NULL — 생성에 사용된 AI 명령 (013) |
| source_message_ids | UUID[] | NULL — AI 요약/추출의 원본 메시지 ids (013) |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `idx_messages_room_created` — (room_id, created_at DESC)
- `messages_content_tsv_idx` — GIN (content_tsv) (011)
- `messages_content_trgm_idx` — GIN (content gin_trgm_ops), ILIKE 검색 가속 (011)
- `messages_entities_gin_idx` — GIN (entities jsonb_path_ops), 멘션 조회 (013)
- `idx_messages_parent_created` — (parent_message_id, created_at ASC) WHERE parent_message_id IS NOT NULL, 스레드 답글 조회 (019)
- `idx_messages_room_parent_created` — (room_id, parent_message_id, created_at DESC), 방 top-level 메시지 조회 (019)

### message_reactions (019)

이모지 반응. 한 사용자가 한 메시지에 같은 이모지를 중복으로 달 수 없다.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| message_id | UUID | NOT NULL, FK → messages(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| emoji | VARCHAR(32) | NOT NULL |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

제약: `PRIMARY KEY (message_id, user_id, emoji)`

인덱스:
- `idx_message_reactions_message` — (message_id)

### scheduled_messages (018)

예약 전송. 1분 주기 poller가 due row를 실제 메시지로 변환한다. 상태는 컬럼 조합으로 파생: `sent_at` 존재 → 발송 완료, `cancelled_at` 존재 → 취소, `error` 존재 → 실패, 셋 다 NULL → 대기.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| room_id | UUID | NOT NULL, FK → rooms(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| content | TEXT | NOT NULL |
| entities | JSONB | NOT NULL DEFAULT '[]' |
| attachment_id | UUID | NULL, FK → attachments(id) ON DELETE SET NULL |
| scheduled_at | TIMESTAMP | NOT NULL |
| sent_at | TIMESTAMP | NULL |
| cancelled_at | TIMESTAMP | NULL |
| error | TEXT | NULL |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `idx_scheduled_messages_due` — (scheduled_at) WHERE sent_at IS NULL AND cancelled_at IS NULL (poller 스캔)
- `idx_scheduled_messages_room` — (room_id)
- `idx_scheduled_messages_user` — (user_id)

### attachments

메시지/프로젝트/제품/업무 공용 첨부파일.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| message_id | UUID | FK → messages(id) ON DELETE CASCADE |
| project_id | UUID | (논리 참조) |
| product_id | UUID | (논리 참조) |
| task_id | UUID | (논리 참조) |
| uploaded_by | UUID | NOT NULL, FK → users(id) |
| file_name | TEXT | NOT NULL |
| file_url | TEXT | NOT NULL |
| file_type | VARCHAR(100) | |
| file_size | BIGINT | |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

---

## 3. 공지

### notices

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| room_id | UUID | **NULL 허용** (004에서 NOT NULL 해제 — 방과 무관한 전사 공지 지원), FK → rooms(id) ON DELETE CASCADE |
| message_id | UUID | FK → messages(id) |
| title | VARCHAR(200) | NOT NULL |
| content | TEXT | NOT NULL |
| created_by | UUID | NOT NULL, FK → users(id) |
| is_required | BOOLEAN | NOT NULL DEFAULT true — 필독 여부 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

### notice_reads

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| notice_id | UUID | NOT NULL, FK → notices(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| read_at | TIMESTAMP | |
| confirmed_at | TIMESTAMP | |

제약: `UNIQUE (notice_id, user_id)`

---

## 4. 프로젝트 / 업무 / 결정사항

### projects

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| name | VARCHAR(200) | NOT NULL |
| description | TEXT | |
| status | VARCHAR(50) | NOT NULL DEFAULT '준비중' |
| priority | VARCHAR(50) | NOT NULL DEFAULT '보통' |
| owner_id | UUID | FK → users(id) |
| practical_owner_id | UUID | FK → users(id) — 실무 담당자 |
| start_date | DATE | |
| due_date | DATE | |
| completed_at | DATE | |
| progress | INTEGER | NOT NULL DEFAULT 0 |
| sales_status | VARCHAR(50) | NOT NULL DEFAULT '준비중' |
| sales_block_reason | TEXT | |
| code | VARCHAR(50) | 프로젝트 코드 (002) |
| full_name | VARCHAR(200) | 정식 명칭 (002) |
| stage_label | VARCHAR(100) | 단계 라벨 (002) |
| department | VARCHAR(100) | 주관 부서명 (002) |
| owner_name | VARCHAR(100) | 담당자 표시명 (002) |
| goals | TEXT[] | NOT NULL DEFAULT '{}' — 목표 목록 (002) |
| outputs | TEXT[] | NOT NULL DEFAULT '{}' — 산출물 목록 (002) |
| budget | VARCHAR(50) | (002) |
| type | VARCHAR(100) | 프로젝트 유형 (002) |
| external_partners | VARCHAR(200) | 외부 협력사 (002) |
| related_product_ids | UUID[] | NOT NULL DEFAULT '{}' — 관련 제품 ids (002) |
| created_by | UUID | NOT NULL, FK → users(id) |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

### project_members

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| project_id | UUID | NOT NULL, FK → projects(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| role | VARCHAR(100) | NOT NULL |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

제약: `UNIQUE (project_id, user_id)`

### tasks

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| project_id | UUID | NOT NULL, FK → projects(id) ON DELETE CASCADE |
| title | VARCHAR(200) | NOT NULL |
| description | TEXT | |
| assignee_id | UUID | FK → users(id) |
| reviewer_id | UUID | FK → users(id) |
| status | VARCHAR(50) | NOT NULL DEFAULT '할일' |
| priority | VARCHAR(50) | NOT NULL DEFAULT '보통' |
| start_date | DATE | |
| due_date | DATE | |
| progress | INTEGER | NOT NULL DEFAULT 0 |
| related_message_id | UUID | FK → messages(id) |
| code | VARCHAR(50) | 업무 코드 (002) |
| due_label | VARCHAR(50) | 마감 표시 라벨 (002) |
| created_by | UUID | NOT NULL, FK → users(id) |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

### decisions

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| project_id | UUID | NOT NULL, FK → projects(id) ON DELETE CASCADE |
| title | VARCHAR(200) | NOT NULL |
| content | TEXT | NOT NULL |
| decided_by | UUID | NOT NULL, FK → users(id) |
| decision_date | DATE | NOT NULL |
| related_message_id | UUID | FK → messages(id) — DTO에서는 sourceMessageId로 노출 |
| related_file_id | UUID | FK → attachments(id) |
| is_deleted | BOOLEAN | NOT NULL DEFAULT false — soft delete (012) |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `decisions_project_idx` — (project_id) (012)
- `decisions_decided_by_idx` — (decided_by) (012)

### decision_reads (012)

결정사항 확인 추적. notice_reads와 같은 패턴.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| decision_id | UUID | NOT NULL, FK → decisions(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| confirmed_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

제약: `UNIQUE (decision_id, user_id)`

인덱스:
- `decision_reads_user_idx` — (user_id)

---

## 5. 제품 (products / specs / lots / sales_status_events)

### products

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| name | VARCHAR(200) | NOT NULL |
| category | VARCHAR(100) | |
| description | TEXT | |
| features | TEXT | |
| application_area | TEXT | |
| usage_method | TEXT | |
| caution | TEXT | |
| sales_status | VARCHAR(50) | NOT NULL DEFAULT '준비중' |
| sales_block_reason | TEXT | |
| owner_id | UUID | FK → users(id) |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

### product_documents

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE |
| attachment_id | UUID | NOT NULL, FK → attachments(id) ON DELETE CASCADE |
| document_type | VARCHAR(100) | NOT NULL — 분류 필터(catalog, test_report, proposal, price_sheet, install_guide, faq, certificate, image) |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `product_documents_type_idx` — (product_id, document_type) (015)

### product_specs (015)

제품 사양 key-value (예: 인장강도=520 N/mm²).

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE |
| key | TEXT | NOT NULL |
| value | TEXT | NOT NULL |
| sort_order | INT | NOT NULL DEFAULT 0 |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

제약: `UNIQUE (product_id, key)`

인덱스:
- `product_specs_product_idx` — (product_id, sort_order)

### product_lots (015)

생산 LOT. verdict는 시험 판정 ('pass'|'hold'|'retest').

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE |
| lot_no | TEXT | NOT NULL |
| produced_at | DATE | |
| quantity_kg | NUMERIC(12,2) | |
| verdict | VARCHAR(20) | pass / hold / retest |
| tested_at | DATE | |
| notes | TEXT | |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

제약: `UNIQUE (product_id, lot_no)`

인덱스:
- `product_lots_product_idx` — (product_id, produced_at DESC)

### sales_status_events (015)

영업 가능 상태 변경 타임라인. `PATCH /products/:id`의 salesStatus 변경 hook에서 자동 insert.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE |
| from_status | VARCHAR(40) | |
| to_status | VARCHAR(40) | NOT NULL |
| reason | TEXT | |
| changed_by | UUID | NOT NULL, FK → users(id) |
| changed_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `sales_status_events_product_idx` — (product_id, changed_at DESC)

---

## 6. 알림

### user_notifications (014)

사용자별 알림 inbox. `read_at` NULL ⇒ 미확인.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| kind | VARCHAR(40) | NOT NULL — 카테고리 (message:new, notice:new, mention, task:assigned 등) |
| title | TEXT | NOT NULL |
| body | TEXT | |
| link | TEXT | 클릭 시 이동 경로 |
| payload | JSONB | 도메인별 부가 데이터 |
| read_at | TIMESTAMP | NULL |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `user_notifications_user_created_idx` — (user_id, created_at DESC)
- `user_notifications_user_unread_idx` — (user_id) WHERE read_at IS NULL

### user_notification_settings (014)

사용자별 알림 정책. per_room/per_project은 `{ "<id>": false }` 형식의 jsonb — 명시되지 않은 id는 기본 on.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, UNIQUE, FK → users(id) ON DELETE CASCADE |
| all_enabled | BOOLEAN | NOT NULL DEFAULT true |
| per_room | JSONB | NOT NULL DEFAULT '{}' |
| per_project | JSONB | NOT NULL DEFAULT '{}' |
| web_push_enabled | BOOLEAN | NOT NULL DEFAULT false |
| browser_enabled | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

### push_subscriptions (014)

Web Push 구독. 한 사용자가 여러 기기/브라우저에서 가입 가능.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| endpoint | TEXT | NOT NULL |
| p256dh | TEXT | NOT NULL |
| auth | TEXT | NOT NULL |
| user_agent | TEXT | |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

제약: `UNIQUE (user_id, endpoint)`

인덱스:
- `push_subscriptions_user_idx` — (user_id)

### org_notification_defaults (017)

알림 카테고리별 전사 on/off 게이트. 사용자별 설정보다 상위에서 동작. 행이 없는 카테고리는 enabled(true)로 간주.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| category | VARCHAR(20) | PK — message / mention / notice / task / project / decision |
| enabled | BOOLEAN | NOT NULL DEFAULT true |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_by | UUID | FK → users(id) ON DELETE SET NULL |

---

## 7. 인증 (refresh_tokens / user_invitations)

### refresh_tokens (008)

서버측 refresh token 저장소. 토큰 원문은 저장하지 않고 sha256 hex digest만 보관한다. refresh 시 기존 row를 `revoked_at`으로 폐기하고 새 row를 insert(rotation).

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| token_hash | CHAR(64) | NOT NULL, UNIQUE — sha256 hex digest |
| expires_at | TIMESTAMP | NOT NULL |
| revoked_at | TIMESTAMP | |
| user_agent | TEXT | |
| ip | VARCHAR(64) | |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `refresh_tokens_user_idx` — (user_id)
- `refresh_tokens_expires_idx` — (expires_at)

### user_invitations (016)

admin이 발급하는 가입 초대. token은 단일 사용 + 만료. `accepted_at`이 차면 소진. (refresh_tokens와 달리 raw token 평문 보관 — 초대 URL 복사·전달 필요, 권한 범위가 제한적이라 허용.)

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| email | TEXT | NOT NULL |
| role | VARCHAR(20) | NOT NULL |
| department_id | UUID | FK → departments(id) ON DELETE SET NULL |
| token | TEXT | NOT NULL, UNIQUE |
| invited_by | UUID | NOT NULL, FK → users(id) |
| accepted_at | TIMESTAMP | |
| expires_at | TIMESTAMP | NOT NULL |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `user_invitations_email_idx` — (email)
- `user_invitations_created_idx` — (created_at DESC)

---

## 8. 감사 (audit_logs)

### audit_logs (009)

관리자 행위 감사 로그. user/department/project/notice/file CUD 라우트에 hook. `/admin` 감사 로그 패널이 조회.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| actor_user_id | UUID | FK → users(id) ON DELETE SET NULL |
| actor_name | TEXT | |
| actor_role | VARCHAR(40) | |
| action | VARCHAR(80) | NOT NULL |
| target_type | VARCHAR(40) | |
| target_id | VARCHAR(80) | |
| target_label | TEXT | |
| ip | VARCHAR(64) | |
| level | VARCHAR(20) | NOT NULL DEFAULT 'info' |
| meta | JSONB | |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `audit_logs_created_idx` — (created_at DESC)
- `audit_logs_actor_idx` — (actor_user_id)
- `audit_logs_action_idx` — (action)

---

## 9. ERP / 재고

### product_variants (020)

재고를 나누는 판매/포장 규격(예: 18kg / 20kg / 4L / 말통 / 세트). `product_specs`(설명용 key-value)와 별개. `kg_per_unit`으로 총 재고 kg 환산.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE |
| code | TEXT | NOT NULL |
| name | TEXT | NOT NULL |
| unit_label | TEXT | NOT NULL |
| kg_per_unit | NUMERIC(12,4) | NOT NULL DEFAULT 0 |
| sort_order | INT | NOT NULL DEFAULT 0 |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

제약: `UNIQUE (product_id, code)`

인덱스:
- `product_variants_product_idx` — (product_id, sort_order)

### warehouses (020)

출하/보관 창고.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| code | TEXT | NOT NULL, UNIQUE |
| name | TEXT | NOT NULL |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

### inventory_balances (020)

(규격 × 창고) 현재고 스냅샷. 거래 발생 시 갱신. balances 갱신과 transactions insert는 전표 저장과 하나의 DB 트랜잭션. 음수 재고는 관리자만 허용(앱 레이어 분기), DB 제약 없음.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| product_variant_id | UUID | NOT NULL, FK → product_variants(id) ON DELETE CASCADE |
| warehouse_id | UUID | NOT NULL, FK → warehouses(id) ON DELETE CASCADE |
| quantity | NUMERIC(16,4) | NOT NULL DEFAULT 0 |
| quantity_kg | NUMERIC(16,4) | NOT NULL DEFAULT 0 |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

제약: `PRIMARY KEY (product_variant_id, warehouse_id)`

인덱스:
- `inventory_balances_warehouse_idx` — (warehouse_id)

### inventory_transactions (020, 022)

입고/출고/조정/취소 이력 원장(append-only). `kg_per_unit_snapshot`으로 작성 당시 환산값 박제 — 이후 규격 변경이 과거 거래 kg에 영향 주지 않음.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| product_id | UUID | NOT NULL, FK → products(id) |
| product_variant_id | UUID | NOT NULL, FK → product_variants(id) |
| warehouse_id | UUID | NOT NULL, FK → warehouses(id) |
| direction | VARCHAR(16) | NOT NULL — 'in'(입고) / 'out'(출고) / 'adjust'(조정) / 'cancel'(취소복원) |
| quantity | NUMERIC(16,4) | NOT NULL |
| unit_label | TEXT | NOT NULL |
| kg_per_unit_snapshot | NUMERIC(12,4) | NOT NULL DEFAULT 0 |
| quantity_kg | NUMERIC(16,4) | NOT NULL DEFAULT 0 |
| source_type | VARCHAR(32) | 발생 원천 유형 (전표 등) |
| source_id | UUID | 발생 원천 id |
| lot_id | UUID | FK → product_lots(id) ON DELETE SET NULL — MES 생산 LOT 연결(선택) |
| note | TEXT | |
| external_ref | TEXT | 외부(MES) 동기화 참조 (022) |
| sync_status | VARCHAR(16) | pending / sent / failed / ignored (022) |
| last_synced_at | TIMESTAMP | (022) |
| created_by | UUID | NOT NULL, FK → users(id) |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `inventory_transactions_variant_idx` — (product_variant_id, created_at DESC)
- `inventory_transactions_product_idx` — (product_id, created_at DESC)
- `inventory_transactions_source_idx` — (source_type, source_id)
- `inventory_transactions_external_ref_idx` — (external_ref) (022)

### erp_documents (021, 022)

ERP 전표(판매입력/사용) 헤더. 전표번호는 문서유형 prefix + 전역 연번 시퀀스 `erp_doc_seq`(예: SALE-000123 / USE-000045), 날짜 리셋 없음. 취소는 hard delete 금지 — `status='cancelled'` 전환 + 반대 방향 'cancel' 거래로 재고 복원, `cancelled_at` 기록.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| document_no | TEXT | NOT NULL, UNIQUE |
| document_type | VARCHAR(24) | NOT NULL DEFAULT 'sale' |
| status | VARCHAR(16) | NOT NULL DEFAULT 'active' |
| document_date | DATE | NOT NULL |
| manager_id | UUID | FK → users(id) — 담당자 |
| customer_name | TEXT | 거래처 |
| warehouse_id | UUID | FK → warehouses(id) — 출하창고 |
| transaction_type | VARCHAR(32) | 거래유형 |
| currency | VARCHAR(8) | NOT NULL DEFAULT 'KRW' |
| contact | TEXT | 연락처 |
| address | TEXT | 주소 |
| supply_amount | NUMERIC(18,2) | NOT NULL DEFAULT 0 — 공급가액 합계 |
| vat_amount | NUMERIC(18,2) | NOT NULL DEFAULT 0 — 부가세 합계 (10% 자동 계산 + 라인별 수기 수정 가능) |
| total_amount | NUMERIC(18,2) | NOT NULL DEFAULT 0 |
| note | TEXT | |
| external_ref | TEXT | 외부(MES) 동기화 참조 (022) |
| sync_status | VARCHAR(16) | pending / sent / failed / ignored (022) |
| last_synced_at | TIMESTAMP | (022) |
| created_by | UUID | NOT NULL, FK → users(id) |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| cancelled_at | TIMESTAMP | |

인덱스:
- `erp_documents_date_idx` — (document_date DESC, created_at DESC)
- `erp_documents_type_status_idx` — (document_type, status)
- `erp_documents_customer_idx` — (customer_name)
- `erp_documents_external_ref_idx` — (external_ref) (022)

### erp_document_lines (021)

전표 라인 — 품목코드 / 품목명 / 규격 / 수량 / 단가 / 공급가액 / 부가세 / 적요 / 시리얼·로트.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| document_id | UUID | NOT NULL, FK → erp_documents(id) ON DELETE CASCADE |
| line_no | INT | NOT NULL |
| product_id | UUID | FK → products(id) |
| product_variant_id | UUID | FK → product_variants(id) |
| warehouse_id | UUID | FK → warehouses(id) |
| item_code | TEXT | |
| item_name | TEXT | |
| spec_label | TEXT | |
| quantity | NUMERIC(16,4) | NOT NULL DEFAULT 0 |
| unit_price | NUMERIC(18,2) | NOT NULL DEFAULT 0 |
| supply_amount | NUMERIC(18,2) | NOT NULL DEFAULT 0 |
| vat_amount | NUMERIC(18,2) | NOT NULL DEFAULT 0 |
| note | TEXT | |
| serial_lot | TEXT | |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

제약: `UNIQUE (document_id, line_no)`

인덱스:
- `erp_document_lines_document_idx` — (document_id, line_no)
- `erp_document_lines_variant_idx` — (product_variant_id)

### mes_product_mappings (022)

Hanmir Talk 제품/규격 ↔ MES 제품/품목코드 매핑 (추후 MES 연동 대비 골격).

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE |
| product_variant_id | UUID | FK → product_variants(id) ON DELETE CASCADE |
| mes_product_id | TEXT | |
| mes_item_code | TEXT | |
| mes_unit_label | TEXT | |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() |

인덱스:
- `mes_product_mappings_product_idx` — (product_id)
- `mes_product_mappings_mes_idx` — (mes_product_id, mes_item_code)

### mes_sync_runs (022)

MES 동기화 실행 이력.

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| direction | VARCHAR(16) | NOT NULL — 'inbound'(MES→Talk 입고) / 'outbound'(Talk→MES 차감 전달) |
| status | VARCHAR(16) | NOT NULL DEFAULT 'running' — running / success / failed |
| started_at | TIMESTAMP | NOT NULL DEFAULT NOW() |
| finished_at | TIMESTAMP | |
| error_message | TEXT | |
| meta | JSONB | |

인덱스:
- `mes_sync_runs_started_idx` — (started_at DESC)

---

## 마이그레이션 이력

| 번호 | 파일명 | 요약 |
| --- | --- | --- |
| 001 | 001_initial.sql | 초기 스키마 생성 (departments~decisions 14개 테이블, schema.sql과 동일) |
| 002 | 002_extend_projects_tasks.sql | projects에 code/goals/outputs 등 11개 컬럼, tasks에 code/due_label 추가 |
| 003 | 003_seed_minimum.sql | 한미르 운영 조직 시드 — 부서 12개 + 사용자 22명 (고정 UUID) |
| 004 | 004_notices_optional_room.sql | notices.room_id NOT NULL 해제 — 방과 무관한 전사 공지 허용 |
| 005 | 005_room_pinned_message.sql | rooms.pinned_message_id 추가 — 방당 고정 메시지 1개 |
| 006 | 006_users_bcrypt_password.sql | 시드 사용자의 placeholder 비밀번호를 bcrypt 해시로 일괄 교체 |
| 007 | 007_users_must_change_password.sql | users.must_change_password 추가 — 첫 로그인 시 비밀번호 변경 강제 |
| 008 | 008_refresh_tokens.sql | refresh_tokens 테이블 — sha256 digest 저장, rotation 정책 |
| 009 | 009_audit_logs.sql | audit_logs 테이블 — 관리자 행위 감사 로그 |
| 010 | 010_messages_edited_at.sql | messages.edited_at 추가 — 본문 수정 시각 추적 |
| 011 | 011_messages_fts.sql | messages.content_tsv(생성 컬럼) + GIN/pg_trgm 인덱스 — 검색 인프라 |
| 012 | 012_decisions.sql | decisions.is_deleted 추가 + decision_reads 테이블 (읽음 추적) |
| 013 | 013_messages_entities.sql | messages에 entities(JSONB)/ai_generated/ai_command/source_message_ids 추가 |
| 014 | 014_notifications.sql | user_notifications / user_notification_settings / push_subscriptions 테이블 |
| 015 | 015_product_subsystems.sql | product_specs / product_lots / sales_status_events 테이블 + 문서 유형 인덱스 |
| 016 | 016_invitations.sql | user_invitations 테이블 — 가입 초대/승인 |
| 017 | 017_org_notification_defaults.sql | org_notification_defaults 테이블 — 전사 알림 카테고리 게이트 |
| 018 | 018_scheduled_messages.sql | scheduled_messages 테이블 — DB 영속 예약 전송 + poller 인덱스 |
| 019 | 019_chat_threads_reactions.sql | 스레드 답글 인덱스 2종 + message_reactions 테이블 |
| 020 | 020_erp_inventory_core.sql | ERP 재고 코어 — product_variants / warehouses / inventory_balances / inventory_transactions |
| 021 | 021_erp_documents.sql | ERP 전표 — erp_documents / erp_document_lines + erp_doc_seq 시퀀스 |
| 022 | 022_erp_mes_sync.sql | MES 연동 골격 — mes_product_mappings / mes_sync_runs + 문서/거래에 sync 컬럼 |
