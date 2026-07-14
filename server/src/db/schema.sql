-- Hanmir Talk — PostgreSQL schema (canonical reference)
--
-- This file is the authoritative shape of the database. Migrations under
-- `server/src/db/migrations/*.sql` are applied incrementally to reach this
-- state. For the initial deployment, `001_initial.sql` should produce the
-- same schema as this file.
--
-- Conventions:
--   - All ids are UUID. The application is free to generate uuids client-side
--     or rely on `gen_random_uuid()` (requires `pgcrypto`).
--   - Soft delete via `is_active` where applicable; hard delete is reserved
--     for objects without referential dependents.
--   - Audit columns: `created_at`, `updated_at` default to NOW().

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  position VARCHAR(100),
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  profile_image_url TEXT,
  avatar_tone VARCHAR(20),
  initials VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  project_id UUID,
  created_by UUID NOT NULL REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  last_read_message_id UUID,
  notification_enabled BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

-- 비멤버 열람자(관리자)의 읽음 포인터 — room_members 에 행을 만들면
-- 멤버십 부여가 되므로 별도 테이블 (마이그 035). 멤버는 room_members
-- .last_read_message_id 를 그대로 쓴다.
CREATE TABLE IF NOT EXISTS room_read_markers (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id UUID,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT,
  message_type VARCHAR(50) NOT NULL DEFAULT 'text',
  parent_message_id UUID REFERENCES messages(id),
  related_task_id UUID,
  related_decision_id UUID,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  project_id UUID,
  product_id UUID,
  task_id UUID,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notice_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  UNIQUE (notice_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT '준비중',
  priority VARCHAR(50) NOT NULL DEFAULT '보통',
  owner_id UUID REFERENCES users(id),
  practical_owner_id UUID REFERENCES users(id),
  start_date DATE,
  due_date DATE,
  completed_at DATE,
  progress INTEGER NOT NULL DEFAULT 0,
  sales_status VARCHAR(50) NOT NULL DEFAULT '준비중',
  sales_block_reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES users(id),
  reviewer_id UUID REFERENCES users(id),
  status VARCHAR(50) NOT NULL DEFAULT '할일',
  priority VARCHAR(50) NOT NULL DEFAULT '보통',
  start_date DATE,
  due_date DATE,
  progress INTEGER NOT NULL DEFAULT 0,
  related_message_id UUID REFERENCES messages(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  features TEXT,
  application_area TEXT,
  usage_method TEXT,
  caution TEXT,
  sales_status VARCHAR(50) NOT NULL DEFAULT '준비중',
  sales_block_reason TEXT,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attachment_id UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  decided_by UUID NOT NULL REFERENCES users(id),
  decision_date DATE NOT NULL,
  related_message_id UUID REFERENCES messages(id),
  related_file_id UUID REFERENCES attachments(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
