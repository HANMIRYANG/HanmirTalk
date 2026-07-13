-- Migration: 034_task_milestone_link
-- 업무 → 마일스톤 선택적 연결. 마일스톤은 단계/시점(⬥), 업무는 그 단계를
-- 이루는 실행 일감 — 업무 생성/수정 시 드롭다운으로 연결하고, 목록에
-- 배지·필터로 표시한다. 마일스톤 삭제 시 연결만 해제(SET NULL).
--
-- 기존 운영 DB 적용:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 \
--     -f /docker-entrypoint-initdb.d/034_task_milestone_link.sql

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES project_milestones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks(milestone_id)
  WHERE milestone_id IS NOT NULL;

COMMIT;
