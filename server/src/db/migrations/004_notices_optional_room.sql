-- Migration: 004_notices_optional_room
-- Allow notices to be created without a tied chat room. The MVP write API
-- accepts only (title, content, isMandatory) and lets readers find them at
-- /notices independently of any room.
--
-- Idempotent: ALTER ... DROP NOT NULL is a no-op when already nullable.
--
-- Apply with:
--   psql "$DATABASE_URL" -f server/src/db/migrations/004_notices_optional_room.sql

BEGIN;

ALTER TABLE notices ALTER COLUMN room_id DROP NOT NULL;

COMMIT;
