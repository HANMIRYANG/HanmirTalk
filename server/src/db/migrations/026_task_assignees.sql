-- Migration: 026_task_assignees
-- 업무 다중 담당자 지원. 기존에는 tasks.assignee_id 단일 컬럼만 있어
-- UI에서 여러 명을 선택해도 첫 번째만 저장되고 나머지는 유실됐다.
-- tasks.assignee_id 는 호환용(첫 담당자)으로 유지하고, 전체 목록은
-- task_assignees 에서 관리한다.
--
-- 기존 운영 DB 적용:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 \
--     -f /docker-entrypoint-initdb.d/026_task_assignees.sql

BEGIN;

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

-- 기존 단일 담당자 백필
INSERT INTO task_assignees (task_id, user_id)
SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
