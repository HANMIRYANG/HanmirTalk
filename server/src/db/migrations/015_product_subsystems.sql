-- Migration: 015_product_subsystems
-- Phase 7 J-1 — 제품 페이지의 LOT / 시험성적서 / 영업 이력 / 제품 사양
-- 도메인 영속화.
--
-- product_specs:   key-value 사양 (예: 인장강도=520 N/mm², 두께=2.0mm 등)
-- product_lots:    생산 LOT (lot_no UNIQUE per product). verdict는 시험
--                  판정 ('pass'|'hold'|'retest').
-- sales_status_events: 영업 가능 상태 변경 타임라인. PATCH /products/:id
--                  의 salesStatus 변경 hook에서 자동 insert.
--
-- product_documents.document_type은 기존 free-form text. UI에서 분류 필터
-- (catalog, test_report, proposal, price_sheet, install_guide, faq,
-- certificate, image)로 활용하기 위해 인덱스 추가. enum 강제는 운영 진입
-- 후 데이터 안정화되면 별도 마이그레이션으로 진행.

BEGIN;

CREATE TABLE IF NOT EXISTS product_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, key)
);

CREATE INDEX IF NOT EXISTS product_specs_product_idx ON product_specs (product_id, sort_order);

CREATE TABLE IF NOT EXISTS product_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_no TEXT NOT NULL,
  produced_at DATE,
  quantity_kg NUMERIC(12, 2),
  verdict VARCHAR(20),
  tested_at DATE,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, lot_no)
);

CREATE INDEX IF NOT EXISTS product_lots_product_idx ON product_lots (product_id, produced_at DESC);

CREATE TABLE IF NOT EXISTS sales_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  from_status VARCHAR(40),
  to_status VARCHAR(40) NOT NULL,
  reason TEXT,
  changed_by UUID NOT NULL REFERENCES users(id),
  changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_status_events_product_idx ON sales_status_events (product_id, changed_at DESC);

-- product_documents.document_type 인덱스 (UI 필터 가속).
CREATE INDEX IF NOT EXISTS product_documents_type_idx ON product_documents (product_id, document_type);

COMMIT;
