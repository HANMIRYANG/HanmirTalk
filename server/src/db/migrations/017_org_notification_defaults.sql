-- Migration: 017_org_notification_defaults
-- Phase 8 K-4 — 전사 기본 알림 정책.
--
-- org_notification_defaults: 알림 카테고리별 회사 전체 on/off 스위치.
-- notify.ts dispatch가 카테고리 게이트로 사용 — 특정 카테고리가 꺼지면
-- 그 종류 알림은 전사적으로 발송되지 않는다. 사용자별 세부 설정
-- (user_notification_settings)과는 독립적으로 동작하는 상위 게이트.
--
-- category: message | mention | notice | task | project | decision
-- 행이 없는 카테고리는 default enabled(true)로 간주한다.

BEGIN;

CREATE TABLE IF NOT EXISTS org_notification_defaults (
  category VARCHAR(20) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMIT;
