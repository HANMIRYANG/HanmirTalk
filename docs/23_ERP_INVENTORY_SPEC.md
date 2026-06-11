# 23. ERP 재고/전표 명세

갱신일: 2026-06-11 · 소스: `server/src/routes/erp.ts`, `server/src/db/migrations/020~022`, `apps/web/src/app/(app)/erp/`

## 목적

제품 재고를 규격·창고 단위로 관리하고, 판매/사용 전표 입력 시 재고를 즉시 차감하는
사내 경량 ERP. MES 사양 확보 전까지는 한미르톡 DB 단독 재고 원장으로 동작한다.

## 핵심 개념

### 제품 규격 (product_variants)

- 재고를 나누는 판매/포장 규격. 예) 18kg / 20kg / 4L / 말통 / 세트
- 제품 사양(`product_specs`, 설명용 key-value)과는 별개의 테이블
- `kg_per_unit`으로 규격 수량 → 총 kg 환산. 거래 시점 값은 `kg_per_unit_snapshot`으로 박제되어 이후 규격 변경이 과거 거래에 영향을 주지 않는다

### 창고 (warehouses)

- 출하/보관 창고. 코드(UNIQUE) + 이름 + 활성 여부

### 재고 스냅샷 / 거래 이력

- `inventory_balances`: (규격 × 창고) 현재고 스냅샷. 수량과 환산 kg 동시 보관
- `inventory_transactions`: 모든 입고/출고/조정/취소 이력의 append-only 원장
  - direction: `in` / `out` / `adjust` / `cancel`
  - `source_type`/`source_id`로 전표 등 발생 원천 역추적, `lot_id`로 생산 LOT 연결 가능
- 초기 재고/조정은 관리자가 `POST /erp/inventory/import`로 일괄 등록

### 판매/사용 전표 (erp_documents, erp_document_lines)

- 헤더: 일자 / 담당자 / 거래처 / 출하창고 / 거래유형 / 통화 / 연락처 / 주소
- 라인: 품목코드 / 품목명 / 규격 / 수량 / 단가 / 공급가액 / 부가세 / 적요 / 시리얼·로트
- 전표번호: 전역 연번 시퀀스 (`SALE-000123` / `USE-000045`), 날짜 리셋 없음
- 저장 성공 시 재고 즉시 차감 — 전표 insert + balances 갱신 + transactions insert가 단일 DB 트랜잭션
- 재고 부족 시 일반 사용자는 409 차단, admin은 `allowNegative`로 음수 재고 허용 가능
- 취소: hard delete 금지. `status='cancelled'` 전환 + 반대 방향 `cancel` 거래로 재고 복원
- 부가세: 공급가액 10% 자동 계산 + 라인별 수기 수정 가능

### MES 연동 (골격만, 보류 중)

- `mes_product_mappings`: 한미르톡 제품/규격 ↔ MES 제품/품목코드 매핑
- `mes_sync_runs`: 동기화 실행 이력 (inbound/outbound, 성공/실패, meta)
- `erp_documents` / `inventory_transactions`에 `external_ref`, `sync_status`, `last_synced_at` 컬럼으로 idempotent 동기화 대비
- 실제 동기화 어댑터는 미구현 — MES 사양 확보 후 재설계 없이 붙일 수 있도록 스키마만 선반영

**연동 시점 (2026-06-11 결정):** MES는 정부 과제로 자체 구축 중이며, 해당 MES가
어느 정도 가시화되어 사양이 확정된 뒤에 연동을 진행한다. 그 전까지는 위 스키마
골격을 유지만 하고 추가 구현을 하지 않는다.

- 서버 엔드포인트(`/erp/mes/mappings` 조회·생성·수정, `/erp/mes/sync-runs`)는 유지
- 웹 클라이언트의 매핑 수정(`updateMesMapping`)·동기화 이력 조회(`listMesSyncRuns`)
  함수는 호출하는 UI가 없어 커밋 `a144d16`에서 제거됨 — 연동 구현 시 git 히스토리에서
  복원하여 사용

## 주요 화면

- `/erp` — 재고 원장 메인: 제품별 재고 요약 + 최근 전표 목록
- `/erp/documents/new` — 판매/사용 전표 입력 (제품 검색 모달, 라인 편집)
- `/erp/documents/[id]` — 전표 상세 + 취소 버튼

## 외부 ERP 전환 방향 (2026-06-11 결정·합의)

별도의 자체 ERP를 외부에서 개발 중이다. 완성 시 한미르톡의 ERP 메뉴(사이드바
아이콘)는 내장 화면 대신 **해당 ERP 페이지로 이동하는 링크** 형태로 전환한다.

### 데이터 소유 원칙 (합의 완료)

한 데이터는 한 시스템만 소유하고 나머지는 조회만 한다 — 이중 원장 금지.

| 시스템 | 소유 데이터 | 비고 |
|---|---|---|
| MES (정부 과제) | 재고·생산 원장 (현재고, 입출고 이력, LOT) | 새 ERP 는 재고를 보유하지 않고 MES 조회 API 로 실시간 확인 |
| 새 ERP | 거래 원장 (전표, 거래처, 단가/부가세, 정산) + **품목 마스터** | 한미르톡 products 는 조회 전용으로 전환 |
| 한미르톡 | 사람·소통 (알림, 승인/확인, 공유, 요약 조회) | 데이터 비소유 — 이벤트가 사람에게 도달하는 통로 |

### 단계별 전환 계획 (합의 완료)

1. **지금**: 현행 유지 — 전표 입력은 내장 ERP 에서 계속
2. **새 ERP 오픈 시**: 사이드바 아이콘 링크 전환 + 기존 전표 CSV 이관
   (`/erp/exports/*` 활용) + 한미르톡 대시보드에 read-only 요약 카드
3. **그 다음**: 웹훅 알림 연동 — ERP/MES 이벤트(전표 승인 요청, 안전재고
   미달, 동기화 실패 등)를 한미르톡 알림센터/웹푸시로 전달. 승인성
   이벤트는 "확인 현황" 패턴 재사용. 채팅 공유용 `erp_ref` entity 타입은
   선택 과제
4. **MES 가시화 시**: 재고 기능 전체를 MES 로 이관 (잔량은 MES 초기
   재고로), 내장 재고 화면 정리

### 참고

- 전환 전까지 현재 내장 ERP 화면과 서버 API 는 그대로 운영
- 규격/창고 수정(`updateVariant`/`updateWarehouse`), 재고 거래 이력
  조회(`listTransactions`) 클라이언트 함수는 UI 없이 방치되어 커밋 `a144d16`에서
  제거됨 — 내장 화면을 확장하기로 결정하면 git 히스토리에서 복원

## API 요약

엔드포인트 전체 목록과 권한은 `08_API_SPEC.md`의 ERP 섹션 참고.

- 조회: `/erp/variants`, `/erp/warehouses`, `/erp/inventory*`, `/erp/documents*`, `/erp/mes/*`
- 변경: 규격/창고/매핑 관리 + 재고 import (admin), 전표 저장/취소 (인증 사용자)
- 출력: `/erp/exports/inventory`, `/erp/exports/documents` — UTF-8 BOM CSV (Excel 호환)

## 권한

- 읽기(재고/규격/창고/전표/매핑 조회, CSV 출력): 인증 사용자 전체
- 규격/창고/MES 매핑 관리, 초기 재고 등록: admin / super_admin
- 전표 저장/취소: 인증 사용자 전체 (음수 재고 허용은 admin 한정)
- 모든 쓰기 작업은 감사 로그(`erp.*` 액션) 기록
