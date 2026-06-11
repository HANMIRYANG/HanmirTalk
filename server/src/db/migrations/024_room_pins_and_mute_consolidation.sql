-- 024 — 채팅 목록 per-user 고정 + 방별 알림 일원화
--
-- (1) room_members.pinned: 채팅 목록 "고정된 대화" (Room.pinned).
--     기존에는 타입/UI 만 있고 저장 컬럼이 없어 운영에서 항상 비어 있었다.
--
-- (2) 방별 알림을 room_members.notification_enabled(음소거) 하나로 일원화.
--     설정 페이지의 user_notification_settings.per_room 에 false 로 꺼둔
--     항목을 음소거로 이전하고 per_room 은 비운다. notify.ts 는 이후
--     per_room 대신 notification_enabled 를 본다.

ALTER TABLE room_members ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;

UPDATE room_members rm
   SET notification_enabled = false
  FROM user_notification_settings s,
       jsonb_each(s.per_room) AS pr(room_id, enabled)
 WHERE s.user_id = rm.user_id
   AND rm.room_id::text = pr.room_id
   AND pr.enabled = 'false'::jsonb;

UPDATE user_notification_settings
   SET per_room = '{}'::jsonb
 WHERE per_room <> '{}'::jsonb;
