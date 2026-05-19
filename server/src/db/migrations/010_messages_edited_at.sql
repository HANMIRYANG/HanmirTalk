-- Migration: 010_messages_edited_at
-- Phase 2 E-1 — track when a message body was edited.
--
-- `is_deleted` already exists from 001_initial.sql. We just need a separate
-- `edited_at` column. Keeping it distinct from `updated_at` (which auto-
-- changes for any UPDATE — including the soft-delete flip) means the UI
-- can show "수정됨" only when the BODY actually changed, not on every row
-- mutation.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS).
--
-- Apply with:
--   psql "$DATABASE_URL" -f server/src/db/migrations/010_messages_edited_at.sql

BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP NULL;

COMMIT;
