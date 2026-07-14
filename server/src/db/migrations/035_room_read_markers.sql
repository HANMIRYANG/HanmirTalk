-- 035 — 비멤버 열람자(관리자)의 읽음 포인터 분리 테이블
--
-- 관리자는 멤버가 아닌 방도 전체 열람할 수 있는데, 읽음 포인터가
-- room_members.last_read_message_id 에만 있어서 (a) markRead 가 no-op
-- (UPDATE-only — INSERT 하면 멤버십 부여가 되는 권한상승 때문에 금지)
-- 이고 (b) unread 계산은 "행 없음 = 전부 안읽음"이라 목록의 안읽음
-- 배지가 영영 사라지지 않았다. 멤버십 의미가 전혀 없는 별도 테이블에
-- 읽음 포인터만 저장한다. 멤버는 기존 room_members 경로를 그대로 쓴다.

CREATE TABLE IF NOT EXISTS room_read_markers (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id UUID,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);
