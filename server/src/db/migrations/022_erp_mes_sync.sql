-- Migration: 022_erp_mes_sync
-- Phase 12-B / 12-F — MES 양방향 연동 준비.
--
-- 1차(MES 사양 제공 전, ~2026-08): Hanmir Talk DB 단독 재고 원장으로 동작.
-- 본 마이그레이션은 추후 MES 연동을 '재설계 없이' 받아들이기 위한 골격만
-- 미리 깔아둔다. 실제 연동 어댑터는 Phase 12 범위 밖.
--
-- mes_product_mappings: Hanmir Talk 제품/규격 ↔ MES 제품/품목코드 매핑.
-- mes_sync_runs:        동기화 실행 이력(inbound/outbound, 성공/실패, meta).
--
-- idempotency(Phase 12-F): external_ref 또는 (system, document_no, line_no)
-- 조합으로 중복 처리 방지. sync_status 로 재시도 추적.
--   pending | sent | failed | ignored

BEGIN;

CREATE TABLE IF NOT EXISTS mes_product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  mes_product_id TEXT,
  mes_item_code TEXT,
  mes_unit_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mes_product_mappings_product_idx
  ON mes_product_mappings (product_id);
CREATE INDEX IF NOT EXISTS mes_product_mappings_mes_idx
  ON mes_product_mappings (mes_product_id, mes_item_code);

-- direction: 'inbound'(MES→Talk 입고) | 'outbound'(Talk→MES 차감 전달).
-- status: 'running' | 'success' | 'failed'.
CREATE TABLE IF NOT EXISTS mes_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'running',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  error_message TEXT,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS mes_sync_runs_started_idx
  ON mes_sync_runs (started_at DESC);

-- ERP 문서/재고 거래에 외부 동기화 추적 컬럼 부착.
ALTER TABLE erp_documents
  ADD COLUMN IF NOT EXISTS external_ref TEXT,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(16),
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS external_ref TEXT,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(16),
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS erp_documents_external_ref_idx
  ON erp_documents (external_ref);
CREATE INDEX IF NOT EXISTS inventory_transactions_external_ref_idx
  ON inventory_transactions (external_ref);

COMMIT;
