-- Migration: 020_erp_inventory_core
-- Phase 12-B — ERP 재고 원장 코어.
--
-- product_variants:     재고를 나누는 판매/포장 규격. product_specs(설명용
--                       key-value)와 별개. 예) 18kg / 20kg / 4L / 말통 / 세트.
--                       kg_per_unit 으로 총 재고 kg 환산.
-- warehouses:           출하/보관 창고. 스크린샷의 '출하창고'(코드+이름).
-- inventory_balances:   (규격 × 창고) 현재고 스냅샷. 거래 발생 시 갱신.
-- inventory_transactions: 모든 입고/출고/조정/취소 이력 원장(append-only).
--                       kg_per_unit_snapshot 으로 작성 당시 환산값 박제 →
--                       이후 규격 변경이 과거 거래 kg 에 영향 주지 않음.
--
-- 재고 차감 규칙(Phase 12-C): 전표 저장 성공 시 즉시 차감. balances 갱신과
-- transactions insert 는 documents 저장과 하나의 DB 트랜잭션. 음수 재고는
-- 관리자만 허용(앱 레이어에서 분기), DB 레벨 제약은 두지 않는다.

BEGIN;

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  kg_per_unit NUMERIC(12, 4) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, code)
);

CREATE INDEX IF NOT EXISTS product_variants_product_idx
  ON product_variants (product_id, sort_order);

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity NUMERIC(16, 4) NOT NULL DEFAULT 0,
  quantity_kg NUMERIC(16, 4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_variant_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS inventory_balances_warehouse_idx
  ON inventory_balances (warehouse_id);

-- direction: 'in'(입고) | 'out'(출고) | 'adjust'(조정) | 'cancel'(취소복원).
-- source_type/source_id 로 전표 등 발생 원천을 역추적. lot_id 는 MES 생산
-- LOT(product_lots) 연결용(선택).
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  product_variant_id UUID NOT NULL REFERENCES product_variants(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  direction VARCHAR(16) NOT NULL,
  quantity NUMERIC(16, 4) NOT NULL,
  unit_label TEXT NOT NULL,
  kg_per_unit_snapshot NUMERIC(12, 4) NOT NULL DEFAULT 0,
  quantity_kg NUMERIC(16, 4) NOT NULL DEFAULT 0,
  source_type VARCHAR(32),
  source_id UUID,
  lot_id UUID REFERENCES product_lots(id) ON DELETE SET NULL,
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_transactions_variant_idx
  ON inventory_transactions (product_variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_transactions_product_idx
  ON inventory_transactions (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_transactions_source_idx
  ON inventory_transactions (source_type, source_id);

COMMIT;
