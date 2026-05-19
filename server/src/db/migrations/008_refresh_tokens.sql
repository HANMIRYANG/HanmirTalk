-- Migration: 008_refresh_tokens
-- Phase 1 D-3 — server-side refresh token store. Pairs with the new
-- httpOnly + Secure cookie strategy:
--   hanmir_token   (access)  — 15 min, in-memory sessionStore (unchanged)
--   hanmir_refresh (refresh) — 30 days, this table, rotated on every use
--
-- Tokens themselves are NEVER stored. Only the sha256 hex digest is kept,
-- so a DB compromise does not leak usable bearer tokens. The raw token is
-- only returned once at issue time (set into the cookie) and discarded.
--
-- Rotation policy: on POST /auth/refresh we mark `revoked_at = NOW()` on
-- the matched row and INSERT a new row. Stale (rotated) tokens become
-- single-use; replay attacks fail because the digest no longer resolves
-- to a non-revoked row.
--
-- Idempotent (CREATE IF NOT EXISTS).
--
-- Apply with:
--   psql "$DATABASE_URL" -f server/src/db/migrations/008_refresh_tokens.sql

BEGIN;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- sha256 hex digest of the raw token, 64 chars. UNIQUE so duplicate
  -- INSERTs (collision; astronomically unlikely with 32-byte tokens) fail
  -- loudly instead of silently overwriting.
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  user_agent TEXT,
  ip VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx ON refresh_tokens (expires_at);

COMMIT;
