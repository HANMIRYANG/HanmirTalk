-- Migration: 021_erp_documents
-- Phase 12-B / 12-C — ERP 전표(판매입력/사용) 헤더 + 라인.
--
-- 스크린샷(판매입력) 기준:
--   헤더 = 일자 / 담당자 / 거래처 / 출하창고 / 거래유형 / 통화 / 연락처 / 주소
--   라인 = 품목코드 / 품목명 / 규격 / 수량 / 단가 / 공급가액 / 부가세 / 적요 / 시리얼·로트
--
-- 전표번호(Phase 12-H 결정): 전역 연번. 문서유형 prefix + 끊기지 않는
-- 시퀀스. 예) SALE-000123 / USE-000045. 날짜 리셋 없음. 채번은 재고 차감과
-- 같은 트랜잭션 안에서 erp_doc_seq 시퀀스로 원자적 발급.
--
-- 취소(Phase 12-C): row hard delete 금지. status='cancelled' 로 전환 +
-- 반대 방향 inventory_transactions('cancel') 로 재고 복원. cancelled_at 기록.
--
-- 부가세(Phase 12-H 결정): 공급가액 10% 자동 계산 + 라인별 수기 수정 가능.
-- vat_amount 는 계산 결과를 그대로 저장(면세/영세율 라인은 0 또는 수기값).

BEGIN;

-- 전역 전표 연번. 유형 무관 단일 시퀀스 → 누락 감지 용이.
CREATE SEQUENCE IF NOT EXISTS erp_doc_seq START 1;

CREATE TABLE IF NOT EXISTS erp_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_no TEXT NOT NULL UNIQUE,
  document_type VARCHAR(24) NOT NULL DEFAULT 'sale',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  document_date DATE NOT NULL,
  manager_id UUID REFERENCES users(id),
  customer_name TEXT,
  warehouse_id UUID REFERENCES warehouses(id),
  transaction_type VARCHAR(32),
  currency VARCHAR(8) NOT NULL DEFAULT 'KRW',
  contact TEXT,
  address TEXT,
  supply_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS erp_documents_date_idx
  ON erp_documents (document_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS erp_documents_type_status_idx
  ON erp_documents (document_type, status);
CREATE INDEX IF NOT EXISTS erp_documents_customer_idx
  ON erp_documents (customer_name);

CREATE TABLE IF NOT EXISTS erp_document_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES erp_documents(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  product_id UUID REFERENCES products(id),
  product_variant_id UUID REFERENCES product_variants(id),
  warehouse_id UUID REFERENCES warehouses(id),
  item_code TEXT,
  item_name TEXT,
  spec_label TEXT,
  quantity NUMERIC(16, 4) NOT NULL DEFAULT 0,
  unit_price NUMERIC(18, 2) NOT NULL DEFAULT 0,
  supply_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  note TEXT,
  serial_lot TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, line_no)
);

CREATE INDEX IF NOT EXISTS erp_document_lines_document_idx
  ON erp_document_lines (document_id, line_no);
CREATE INDEX IF NOT EXISTS erp_document_lines_variant_idx
  ON erp_document_lines (product_variant_id);

COMMIT;
