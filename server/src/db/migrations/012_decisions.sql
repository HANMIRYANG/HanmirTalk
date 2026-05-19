-- Migration: 012_decisions
-- Phase 3 F-1 — make the existing decisions table soft-deletable + add the
-- per-user read tracking table (analogous to notice_reads).
--
-- 001_initial.sql:189 already creates the decisions table with the columns
-- we need: id, project_id, title, content, decided_by, decision_date,
-- related_message_id (← the roadmap called this source_message_id but
-- since the schema is established, we keep the existing name and map it
-- to `sourceMessageId` in the DTO layer), related_file_id, timestamps.
--
-- What this migration adds:
--   - `is_deleted BOOLEAN` for soft delete (mirrors messages)
--   - `decision_reads` table for "confirmed by N of M members" tracking,
--     same pattern as `notice_reads`. Roadmap §Q decision 4 — decision
--     read-status must be tracked like notices.
--
-- Idempotent (ADD COLUMN / CREATE TABLE IF NOT EXISTS).
--
-- Apply with:
--   psql "$DATABASE_URL" -f server/src/db/migrations/012_decisions.sql

BEGIN;

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS decisions_project_idx ON decisions (project_id);
CREATE INDEX IF NOT EXISTS decisions_decided_by_idx ON decisions (decided_by);

CREATE TABLE IF NOT EXISTS decision_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (decision_id, user_id)
);

CREATE INDEX IF NOT EXISTS decision_reads_user_idx ON decision_reads (user_id);

COMMIT;
