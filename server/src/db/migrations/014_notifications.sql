-- Migration: 014_notifications
-- Phase 6 I-1 — per-user notification inbox + settings.
--
-- user_notifications: 사용자별 알림 row. kind는 카테고리(message:new,
--   notice:new, mention, task:assigned 등), title/body는 inbox 표시용,
--   link는 클릭 시 이동할 경로, payload는 도메인별 부가 데이터(jsonb).
--   read_at NULL ⇒ 미확인.
--
-- user_notification_settings: 사용자별 알림 정책. all_enabled 전체 토글,
--   per_room/per_project은 room id / project id 별 on-off (jsonb의
--   { "<id>": false } 형식, 명시되지 않은 id는 default on). web_push_enabled
--   는 OS 푸시 활성화, browser_enabled는 in-page Notification API 활성화.

BEGIN;

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(40) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  payload JSONB,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON user_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx
  ON user_notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS user_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  all_enabled BOOLEAN NOT NULL DEFAULT true,
  per_room JSONB NOT NULL DEFAULT '{}'::jsonb,
  per_project JSONB NOT NULL DEFAULT '{}'::jsonb,
  web_push_enabled BOOLEAN NOT NULL DEFAULT false,
  browser_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- I-5 Web Push subscriptions. 사용자 한 명이 여러 기기/브라우저에서
-- 가입할 수 있으므로 user_id + endpoint UNIQUE.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

COMMIT;
