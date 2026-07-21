-- Migration: 036_sso_authorization_tickets
-- HanmirERP SSO — one-time authorization tickets (authorization-code style).
--
-- HanmirTalk acts as the company-wide login entry point. Instead of sharing
-- the hanmir_token / hanmir_refresh cookies across *.hanmirworks.space
-- (explicitly forbidden), GET /auth/sso/authorize issues a short-lived
-- single-use ticket that the ERP backend exchanges server-to-server at
-- POST /auth/sso/exchange for the user's identity. The ERP then mints its
-- own host-scoped HttpOnly session cookie.
--
-- Security properties enforced by this table + the route layer:
--   * The raw ticket is NEVER stored — only its sha256 hex digest
--     (same policy as refresh_tokens, migration 008).
--   * TTL is short (default 60 s); expires_at is checked inside the
--     consuming UPDATE, not in application code.
--   * Single use: consume is one conditional UPDATE
--       SET consumed_at = NOW()
--       WHERE ticket_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
--     so two concurrent exchanges can never both win (row-level lock makes
--     the loser see consumed_at IS NOT NULL and match zero rows).
--   * client_id / redirect_uri are bound at issue time and re-verified at
--     exchange; code_challenge stores the PKCE S256 challenge.
--   * state itself is round-tripped to the client (ERP compares it); only
--     a sha256 digest is kept here for forensics.
--
-- Idempotent (CREATE IF NOT EXISTS).
--
-- Apply with:
--   psql "$DATABASE_URL" -f server/src/db/migrations/036_sso_authorization_tickets.sql

BEGIN;

CREATE TABLE IF NOT EXISTS sso_authorization_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sha256 hex digest of the raw ticket, 64 chars. UNIQUE so an (astronomically
  -- unlikely) digest collision fails loudly instead of silently overwriting.
  ticket_hash CHAR(64) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id VARCHAR(64) NOT NULL,
  redirect_uri TEXT NOT NULL,
  -- sha256 hex digest of the state parameter (raw state is only echoed back
  -- in the redirect, never persisted).
  state_hash CHAR(64),
  -- PKCE S256 code_challenge (base64url, 43 chars for S256). Stored verbatim —
  -- it is already a one-way derivation of the verifier.
  code_challenge VARCHAR(128),
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sso_tickets_user_idx ON sso_authorization_tickets (user_id);
-- Opportunistic cleanup (issue() deletes rows expired > 1 day) scans by expiry.
CREATE INDEX IF NOT EXISTS sso_tickets_expires_idx ON sso_authorization_tickets (expires_at);

COMMIT;
