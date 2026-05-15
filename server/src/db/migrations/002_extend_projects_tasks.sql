-- Migration: 002_extend_projects_tasks
-- Adds DTO-only columns that the shared `Project` / `TaskItem` types expose
-- but `001_initial.sql` did not include. Keeps the existing schema intact and
-- is safe to re-run (`ADD COLUMN IF NOT EXISTS`).
--
-- Apply after 001_initial.sql:
--   psql "$DATABASE_URL" -f server/src/db/migrations/002_extend_projects_tasks.sql

BEGIN;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS stage_label VARCHAR(100),
  ADD COLUMN IF NOT EXISTS department VARCHAR(100),
  ADD COLUMN IF NOT EXISTS owner_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS goals TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS outputs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS budget VARCHAR(50),
  ADD COLUMN IF NOT EXISTS type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS external_partners VARCHAR(200),
  ADD COLUMN IF NOT EXISTS related_product_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS due_label VARCHAR(50);

COMMIT;
