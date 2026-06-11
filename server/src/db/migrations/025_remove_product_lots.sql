-- Migration: 025_remove_product_lots
-- 제품 생산 LOT 기능 제거 (담당자 요청). product_lots 테이블과
-- inventory_transactions.lot_id(코드에서 한 번도 쓰지 않은 휴면 FK 컬럼)를
-- 함께 드롭한다. ERP 전표의 serial_lot 자유 텍스트 컬럼은 무관하므로 유지.
--
-- 기존 운영 DB 적용:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 \
--     -f /docker-entrypoint-initdb.d/025_remove_product_lots.sql

BEGIN;

ALTER TABLE inventory_transactions DROP COLUMN IF EXISTS lot_id;
DROP TABLE IF EXISTS product_lots;

COMMIT;
