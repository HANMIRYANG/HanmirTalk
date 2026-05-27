-- Migration: 019_chat_threads_reactions
-- Phase 11 — 채팅 스레드 답글 + 이모지 반응.
--
-- 스레드 답글:
--   001_initial 의 messages.parent_message_id 컬럼을 그대로 재사용.
--   listByRoom 은 parent_message_id IS NULL 인 top-level 만 반환하고,
--   별도 listReplies(parent_id) 로 자식 메시지를 조회한다.
--
--   인덱스 의도:
--   - idx_messages_parent_created: 특정 parent 의 답글을 시간순 조회
--     (drawer 열 때 GET /messages/:id/replies)
--   - idx_messages_room_parent_created: 방의 top-level 만 시간순 조회
--     (listByRoom 의 hot path — parent_message_id IS NULL 필터를 위해
--     동일 컬럼을 인덱스에 포함)
--
-- 이모지 반응:
--   (message_id, user_id, emoji) PK 로 한 사용자가 한 메시지에 같은
--   이모지를 두 번 박지 못하도록 강제. 토글 UX 는 routes 에서
--   INSERT … ON CONFLICT DO NOTHING / DELETE 로 구현.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_messages_parent_created
  ON messages(parent_message_id, created_at ASC)
  WHERE parent_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_room_parent_created
  ON messages(room_id, parent_message_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- 배치 listForMessages 가 message_id 로 in-clause 조회 → 인덱스 활용.
CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions(message_id);

COMMIT;
