-- Migration: 023_file_folders
-- 파일함 폴더 체계.
--
-- file_folders: 트리 구조 폴더.
--   - parent_id NULL ⇒ 최상위(부서) 폴더. admin/super_admin 만 생성.
--   - member_ids: 루트 폴더의 "참여자" — 해당 트리 안에서 하위 폴더를
--     만들 수 있는 사용자 목록. 하위 폴더에서는 빈 배열 (루트에서 상속).
--   - password_hash: 하위 폴더에만 설정 가능한 진입 비밀번호 (bcrypt).
--     NULL ⇒ 비밀번호 없음. super_admin 은 비밀번호 없이 진입.
--
-- attachments.folder_id: 파일이 속한 폴더. 폴더 삭제는 빈 폴더만 허용
--   (라우트에서 검증)하므로 ON DELETE SET NULL 은 안전망이다.

BEGIN;

CREATE TABLE IF NOT EXISTS file_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  parent_id UUID REFERENCES file_folders(id) ON DELETE RESTRICT,
  password_hash TEXT,
  member_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS file_folders_parent_idx ON file_folders (parent_id);

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES file_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS attachments_folder_idx ON attachments (folder_id);

COMMIT;
