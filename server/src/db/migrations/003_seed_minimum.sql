-- Migration: 003_seed_minimum
-- Bootstraps the minimum data needed for a fresh postgres-backed install:
--   * 6 departments matching the memory adapter's seed names
--   * 4 representative users covering each role tier used in dev tests
--     (manager, project_owner, admin, super_admin)
-- All users share the dev `DEFAULT_PASSWORD` (`hanmir1234`). The password_hash
-- column is filled with a placeholder string because the current login flow
-- compares the request body directly to `config.defaultPassword` — see the
-- TODO in `server/src/auth/auth.ts` / `routes/auth.ts`. Once bcrypt/argon2
-- hashing is wired in, regenerate this seed with real hashes.
--
-- This migration is idempotent via `ON CONFLICT DO NOTHING`, so re-running it
-- against a partially seeded database is safe.
--
-- Apply after 001 and 002:
--   psql "$DATABASE_URL" -f server/src/db/migrations/003_seed_minimum.sql

BEGIN;

-- Fixed UUIDs so tests can rely on stable ids.
INSERT INTO departments (id, name, description, is_active) VALUES
  ('11111111-1111-1111-1111-000000000001', '생산기술팀', NULL, true),
  ('11111111-1111-1111-1111-000000000002', '품질보증팀', NULL, true),
  ('11111111-1111-1111-1111-000000000003', '영업본부 1팀', NULL, true),
  ('11111111-1111-1111-1111-000000000004', '인사팀', NULL, true),
  ('11111111-1111-1111-1111-000000000005', '정보지원팀', NULL, true),
  ('11111111-1111-1111-1111-000000000006', '자재팀', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- TODO(password): replace `pending-bcrypt-migration` with a real bcrypt or
-- argon2 hash once hashing is implemented. Login currently bypasses this
-- column.
INSERT INTO users
  (id, name, phone, email, password_hash, department_id, position, role,
   avatar_tone, initials, is_active)
VALUES
  ('22222222-2222-2222-2222-000000000001', '김민준', NULL, 'kim.minjun@hanmir.co.kr',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000001', '책임', 'manager',
   'default', '김민', true),
  ('22222222-2222-2222-2222-000000000002', '박지영', NULL, 'park.jiyoung@hanmir.co.kr',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000001', '책임',
   'project_owner', 'orange', '박지', true),
  ('22222222-2222-2222-2222-000000000003', '강은혜', NULL, 'kang.eunhye@hanmir.co.kr',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000004', '수석', 'admin',
   'gray', '강은', true),
  ('22222222-2222-2222-2222-000000000004', '정민호', NULL, 'jung.minho@hanmir.co.kr',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000001', '팀장',
   'super_admin', 'gray', '정민', true)
ON CONFLICT (email) DO NOTHING;

COMMIT;
