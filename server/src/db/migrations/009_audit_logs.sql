-- Migration: 009_audit_logs
-- Persistent audit log for admin actions (docs/14).
-- Hooked into user/department/project/notice/file CUD routes. Read by
-- /admin 감사 로그 panel.
--
-- Idempotent (CREATE IF NOT EXISTS).
--
-- Apply with:
--   psql "$DATABASE_URL" -f server/src/db/migrations/009_audit_logs.sql

BEGIN;

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_role VARCHAR(40),
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40),
  target_id VARCHAR(80),
  target_label TEXT,
  ip VARCHAR(64),
  level VARCHAR(20) NOT NULL DEFAULT 'info',
  meta JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);

COMMIT;
