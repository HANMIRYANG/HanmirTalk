-- Migration: 003_seed_minimum
-- 한미르 운영 조직 시드 — 12개 부서 + 22명 사용자 (2026-05-21 실제 데이터로 교체).
-- 입력 출처: 직원데이터_입력양식.md
--
-- 비밀번호: 모든 사용자를 placeholder 'pending-bcrypt-migration' 으로 넣는다.
-- 뒤따르는 마이그레이션이 이를 후처리한다:
--   006 → placeholder 를 bcrypt('hanmir1234') 해시로 일괄 교체
--   007 → 그 사용자들에 must_change_password = true (첫 로그인 시 변경 강제)
-- 따라서 전 직원 초기 비밀번호는 'hanmir1234' 이며, 최초 로그인 시 반드시 변경된다.
--
-- 부서·사용자 모두 고정 UUID 를 사용하므로 재실행해도 안전하다
-- (ON CONFLICT DO NOTHING). 빈 DB 의 최초 init 을 전제로 작성되었다 — 더미
-- 시드가 이미 들어간 기존 DB 에 적용하면 UUID 충돌로 건너뛰어진다.
--
-- Apply after 001 and 002:
--   psql "$DATABASE_URL" -f server/src/db/migrations/003_seed_minimum.sql

BEGIN;

-- 부서 12개. 고정 UUID 11111111-1111-1111-1111-0000000000NN.
INSERT INTO departments (id, name, description, is_active) VALUES
  ('11111111-1111-1111-1111-000000000001', '도료사업본부', NULL, true),
  ('11111111-1111-1111-1111-000000000002', '총무IT팀', NULL, true),
  ('11111111-1111-1111-1111-000000000003', '인사노무팀', NULL, true),
  ('11111111-1111-1111-1111-000000000004', '경영기획팀', NULL, true),
  ('11111111-1111-1111-1111-000000000005', '재무회계팀', NULL, true),
  ('11111111-1111-1111-1111-000000000006', '영업본부', NULL, true),
  ('11111111-1111-1111-1111-000000000007', '연구소', NULL, true),
  ('11111111-1111-1111-1111-000000000008', '에어로겔사업팀', NULL, true),
  ('11111111-1111-1111-1111-000000000009', '포천사업소', NULL, true),
  ('11111111-1111-1111-1111-000000000010', 'CEO', NULL, true),
  ('11111111-1111-1111-1111-000000000011', 'CFO', NULL, true),
  ('11111111-1111-1111-1111-000000000012', '경영지원팀', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- 사용자 22명. 고정 UUID 22222222-2222-2222-2222-0000000000NN.
-- password_hash 는 placeholder — 006/007 이 후처리 (위 주석 참고).
-- avatar_tone 은 default/orange/green/purple/gray 5색을 순환 배정.
INSERT INTO users
  (id, name, phone, email, password_hash, department_id, position, role,
   avatar_tone, initials, is_active)
VALUES
  ('22222222-2222-2222-2222-000000000001', '양현준', '010-7940-9609', 'yanghj@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000002', '대리', 'admin',
   'default', '양현', true),
  ('22222222-2222-2222-2222-000000000002', '김권찬', '010-5802-0037', 'kimgc@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000004', '팀장', 'admin',
   'orange', '김권', true),
  ('22222222-2222-2222-2222-000000000003', '진호열', '010-2819-5723', 'jinhy@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000005', '팀장', 'manager',
   'green', '진호', true),
  ('22222222-2222-2222-2222-000000000004', '변진순', '010-7106-7538', 'jinyjirong@naver.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000012', '실장', 'super_admin',
   'purple', '변진', true),
  ('22222222-2222-2222-2222-000000000005', '한승우', '010-2331-4800', 'swhans@naver.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000010', '대표', 'super_admin',
   'gray', '한승', true),
  ('22222222-2222-2222-2222-000000000006', '유경성', '010-7547-1240', 'olley_u@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000011', '부사장', 'super_admin',
   'default', '유경', true),
  ('22222222-2222-2222-2222-000000000007', '성상규', '010-3715-7306', 'sungsk@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000006', '부사장', 'manager',
   'orange', '성상', true),
  ('22222222-2222-2222-2222-000000000008', '좌진협', '010-7723-5417', 'jwajh@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000006', '상무', 'manager',
   'green', '좌진', true),
  ('22222222-2222-2222-2222-000000000009', '김남훈', '010-2601-0437', 'kimnh@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000008', '부장', 'manager',
   'purple', '김남', true),
  ('22222222-2222-2222-2222-000000000010', '김용진', '010-4557-1900', 'kimyj@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000006', '이사', 'manager',
   'gray', '김용', true),
  ('22222222-2222-2222-2222-000000000011', '알리', '010-9697-0323', 'ail@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000007', '사원', 'member',
   'default', '알리', true),
  ('22222222-2222-2222-2222-000000000012', '정연우', '010-3271-1612', 'jeongyw@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000006', '상무', 'manager',
   'orange', '정연', true),
  ('22222222-2222-2222-2222-000000000013', '박용규', '010-3611-3427', 'parkyk@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000007', '이사', 'manager',
   'green', '박용', true),
  ('22222222-2222-2222-2222-000000000014', '정민화', '010-6502-1384', 'jeongmh@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000008', '상무', 'manager',
   'purple', '정민', true),
  ('22222222-2222-2222-2222-000000000015', '민대기', '010-3435-1619', 'dk.min@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000006', '전무', 'manager',
   'gray', '민대', true),
  ('22222222-2222-2222-2222-000000000016', '송민석', '010-5343-6925', 'songms@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000001', '부장', 'manager',
   'default', '송민', true),
  ('22222222-2222-2222-2222-000000000017', '서창걸', '010-8591-3842', 'seocg@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000001', '부장', 'manager',
   'orange', '서창', true),
  ('22222222-2222-2222-2222-000000000018', '염장한', '010-2369-1528', 'yeomjh@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000001', '차장', 'manager',
   'green', '염장', true),
  ('22222222-2222-2222-2222-000000000019', '류수연', '010-6243-0477', 'ryusy@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000001', '과장', 'member',
   'purple', '류수', true),
  ('22222222-2222-2222-2222-000000000020', '져민에', NULL, 'zawma@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000001', '사원', 'member',
   'gray', '져민', true),
  ('22222222-2222-2222-2222-000000000021', '민창기', '010-7373-0807', 'mincg@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000001', '사원', 'member',
   'default', '민창', true),
  ('22222222-2222-2222-2222-000000000022', '김영호', '010-9979-5421', 'kimyh2@hanmirfe.com',
   'pending-bcrypt-migration', '11111111-1111-1111-1111-000000000001', '주임', 'member',
   'orange', '김영', true)
ON CONFLICT (email) DO NOTHING;

COMMIT;
