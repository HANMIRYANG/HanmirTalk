-- Migration: 028_products_code_subcategory
-- 제품 코드/소분류 컬럼 추가. 기존에는 Product DTO의 code/subCategory가
-- 어댑터에서 항상 ""로 고정되어 목록·상세 화면 표기가 영원히 공백이었다.
--
-- 기존 운영 DB 적용:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 \
--     -f /docker-entrypoint-initdb.d/028_products_code_subcategory.sql

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category TEXT;

COMMIT;
