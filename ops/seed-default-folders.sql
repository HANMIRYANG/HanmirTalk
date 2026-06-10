-- 기본 부서 폴더 4종 시드 (idempotent — 같은 이름의 최상위 폴더가 있으면 skip).
-- 참여자(member_ids)는 사용자 이름으로 매핑한다. 적용:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
--     < ops/seed-default-folders.sql

BEGIN;

INSERT INTO file_folders (name, member_ids, created_by)
SELECT '경영지원실',
       ARRAY(SELECT id FROM users WHERE name IN ('양현준','김권찬','진호열','변진순','이현우')),
       (SELECT id FROM users WHERE name = '변진순' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM file_folders WHERE name = '경영지원실' AND parent_id IS NULL
);

INSERT INTO file_folders (name, member_ids, created_by)
SELECT '도료사업부',
       ARRAY(SELECT id FROM users WHERE name IN ('송민석','져민에','염장한','서창걸','김영호','민창기','류수연')),
       (SELECT id FROM users WHERE name = '변진순' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM file_folders WHERE name = '도료사업부' AND parent_id IS NULL
);

INSERT INTO file_folders (name, member_ids, created_by)
SELECT '영업본부',
       ARRAY(SELECT id FROM users WHERE name IN ('김용진','성상규','좌진협','민대기')),
       (SELECT id FROM users WHERE name = '변진순' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM file_folders WHERE name = '영업본부' AND parent_id IS NULL
);

INSERT INTO file_folders (name, member_ids, created_by)
SELECT '연구소',
       ARRAY(SELECT id FROM users WHERE name IN ('정민화','김남훈','박용규','알리','정연우')),
       (SELECT id FROM users WHERE name = '변진순' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM file_folders WHERE name = '연구소' AND parent_id IS NULL
);

COMMIT;

-- 시드 결과 확인
SELECT name, array_length(member_ids, 1) AS members
  FROM file_folders WHERE parent_id IS NULL ORDER BY created_at;
