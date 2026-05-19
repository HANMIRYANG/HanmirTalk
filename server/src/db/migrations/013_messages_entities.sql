-- Migration: 013_messages_entities
-- Phase 5 H-1 — structured mention / reference tokens in messages, plus AI
-- provenance metadata.
--
--   entities          JSONB[]   — see shared/types.ts MessageEntity. Each
--                                 element: { type, id, label, offset, length }.
--                                 Stored as a single JSONB array (not jsonb[])
--                                 to keep ad-hoc client/server filtering simple.
--   ai_generated      BOOLEAN   — true when the message body was produced by
--                                 one of the /ai/* endpoints. UI shows a small
--                                 "AI 초안" badge.
--   ai_command        VARCHAR   — which command generated it ("summarize" etc).
--                                 Null for human-authored messages.
--   source_message_ids UUID[]   — for AI summaries / extractions: the ids of
--                                 the messages that were fed into the model.
--                                 Lets the UI link back to the source range.
--
-- All four are nullable / defaulted so existing rows stay valid.
-- Idempotent (ADD COLUMN IF NOT EXISTS).

BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_command VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS source_message_ids UUID[] NULL;

-- Quick lookup for "messages where user X is mentioned" without scanning
-- the whole table. Uses GIN on the jsonb path.
CREATE INDEX IF NOT EXISTS messages_entities_gin_idx
  ON messages USING GIN (entities jsonb_path_ops);

COMMIT;
