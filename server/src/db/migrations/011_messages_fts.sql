-- Migration: 011_messages_fts
-- Phase 2 E-3 — full-text search infrastructure for messages.
--
-- Adds a generated tsvector column + GIN index. The actual search query
-- (server/src/routes/messages.ts /messages/search) uses ILIKE for now
-- because the 'simple' tokenizer does whitespace-only splitting which
-- doesn't help Korean CJK substrings. The tsvector column is added
-- preemptively so that a future migration to nori/pg_trgm doesn't
-- require backfilling.
--
-- Idempotent. `content_tsv` is GENERATED ALWAYS — never write to it.
--
-- Apply with:
--   psql "$DATABASE_URL" -f server/src/db/migrations/011_messages_fts.sql

BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS messages_content_tsv_idx
  ON messages USING GIN (content_tsv);

-- Trigram index for ILIKE '%q%' to be efficient. pg_trgm ships with
-- PostgreSQL; safe to add. Skip silently on managed environments that
-- have it pre-installed.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS messages_content_trgm_idx
  ON messages USING GIN (content gin_trgm_ops);

COMMIT;
