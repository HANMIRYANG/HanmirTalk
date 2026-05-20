-- Migration: 016_invitations
-- Phase 8 K-2 — 사용자 초대 / 가입 승인.
--
-- user_invitations: admin이 발급하는 가입 초대. raw token으로 비인증
-- accept-invite 흐름을 식별한다 (token은 단일 사용 + expires_at 만료).
-- accepted_at이 차면 소진(consumed)된 것으로 본다.
--
-- token은 refresh_tokens와 달리 raw로 저장한다 — admin이 초대 URL을
-- 복사해 전달할 수 있어야 하고, 권한 범위가 "사전 지정된 email/role로
-- 계정 1개 생성"으로 제한적이라 평문 보관을 허용한다.

BEGIN;

CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role VARCHAR(20) NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users(id),
  accepted_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_invitations_email_idx ON user_invitations (email);
CREATE INDEX IF NOT EXISTS user_invitations_created_idx ON user_invitations (created_at DESC);

COMMIT;
