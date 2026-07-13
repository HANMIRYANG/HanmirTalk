-- Migration: 033_task_hierarchy
-- 하위 업무(1단계) + 주요 업무 플래그.
-- parent_task_id: 상위 업무 참조 (하위 업무의 하위 업무는 API에서 금지).
-- is_key_task: 주요 업무 — 목록에서 그룹 내 최상위 정렬 + ★ 배지,
-- AI 프로젝트 초안으로 자동 등록되는 업무에 부여된다.
--
-- 기존 운영 DB 적용:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 \
--     -f /docker-entrypoint-initdb.d/033_task_hierarchy.sql

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_key_task BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

COMMIT;
