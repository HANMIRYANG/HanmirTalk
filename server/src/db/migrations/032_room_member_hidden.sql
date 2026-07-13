-- 032 — direct(1:1) 방 "나가기" = per-user 숨김
--
-- direct 방은 멤버십 행을 실제로 지우면 (a) findOrCreateDirect 가 기존
-- 방을 못 찾아 같은 상대와 중복 방이 생기고, (b) 한 명만 남은 direct
-- 방이 다른 사용자 짝의 재대화 조회에 오매칭될 수 있다. 그래서 멤버십은
-- 유지한 채 room_members.hidden 으로 "내 목록에서 숨김"만 한다.
-- 새 메시지가 도착하거나(unhideAll) 본인이 다시 1:1 대화를 시작하면
-- (POST /rooms/direct) 자동 해제 — 카카오/슬랙의 DM 닫기와 같은 동작.

ALTER TABLE room_members ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
