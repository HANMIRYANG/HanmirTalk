-- Migration: 030_project_progress_mode
-- 프로젝트 진행률 입력 방식 개선 — 기본은 업무 완료율(완료/전체) 자동
-- 계산, 수정 모달에서 "직접 지정"을 켠 프로젝트만 projects.progress 수동
-- 값을 사용한다 (progress_manual=true).
--
-- 기존 행은 전부 자동 모드(false)로 시작 — 수동 값이 필요한 프로젝트는
-- 수정 모달에서 직접 지정을 켜면 된다.
--
-- 기존 운영 DB 적용:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 \
--     -f /docker-entrypoint-initdb.d/030_project_progress_mode.sql

BEGIN;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS progress_manual BOOLEAN NOT NULL DEFAULT false;

COMMIT;
