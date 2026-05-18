-- Migration: 005_room_pinned_message
-- Adds a single "pinned message" pointer per room. The MVP supports exactly
-- one pinned message per room (matches the existing UI "고정 메시지" banner).
-- Multi-pin support would require a separate room_pinned_messages table.
--
-- Read tracking already exists via `room_members.last_read_message_id`
-- (added in 001), so no extra column is needed for that side.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS skips the work on subsequent runs.
--
-- Apply with:
--   psql "$DATABASE_URL" -f server/src/db/migrations/005_room_pinned_message.sql

BEGIN;

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID
  REFERENCES messages(id) ON DELETE SET NULL;

COMMIT;
