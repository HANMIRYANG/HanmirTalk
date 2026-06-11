-- Migration: 027_project_milestones
-- 프로젝트 마일스톤 영속화. 기존에는 Project DTO의 milestones가 어댑터에서
-- 항상 빈 배열로 고정되어 상세 "주요 일정"과 간트 마일스톤이 운영에서
-- 절대 표시되지 않았다.
--
-- 기존 운영 DB 적용:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 \
--     -f /docker-entrypoint-initdb.d/027_project_milestones.sql

BEGIN;

CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT,
  milestone_date DATE NOT NULL,
  -- done | in_progress | pending | delayed (shared Milestone["status"])
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_milestones_project_idx
  ON project_milestones (project_id, milestone_date);

COMMIT;
