-- Migration: 018_scheduled_messages
-- Phase 10 M-4 — 예약 전송.
--
-- in-process setTimeout 으로 만들면 서버 재시작/배포 시 예약이 증발한다.
-- DB 에 영속해서 1분 주기 poller 가 due row 를 실제 메시지로 변환한다.
--
-- 상태는 row 컬럼 조합으로 파생:
--   sent_at IS NOT NULL          → 발송 완료
--   cancelled_at IS NOT NULL     → 사용자/관리자가 취소
--   error IS NOT NULL            → 발송 실패 (poller 가 마킹)
--   세 컬럼 모두 NULL            → 대기 중 (pending)
--
-- 중복 발송 방지는 row lock 대신 `sent_at IS NULL` guard 가 붙은 UPDATE
-- 의 행 카운트로 한다 (단일 server VM 전제 — N-0 결정).
--
-- attachment_id 는 messages.attachment 와 같은 attachments(id) 를 참조.
-- ON DELETE SET NULL 로 첨부가 사라져도 본문은 보낼 수 있도록 한다.

BEGIN;

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachment_id UUID NULL REFERENCES attachments(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMP NOT NULL,
  sent_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Poller scan 인덱스 — due + still pending 만 빠르게.
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
  ON scheduled_messages (scheduled_at)
  WHERE sent_at IS NULL AND cancelled_at IS NULL;

-- 방 별 목록 (옵션). DM 방 단위 inbox 표시 등.
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_room
  ON scheduled_messages (room_id);

-- 사용자 본인 예약 목록.
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user
  ON scheduled_messages (user_id);

COMMIT;
