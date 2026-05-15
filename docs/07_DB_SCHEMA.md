# 07. DB 스키마 초안

DB는 PostgreSQL 기준으로 설계한다.

## users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(255),
  password_hash TEXT NOT NULL,
  department_id UUID,
  position VARCHAR(100),
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  profile_image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## departments

```sql
CREATE TABLE departments (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## rooms

```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  project_id UUID,
  created_by UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## room_members

```sql
CREATE TABLE room_members (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  last_read_message_id UUID,
  notification_enabled BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT,
  message_type VARCHAR(50) NOT NULL DEFAULT 'text',
  parent_message_id UUID,
  related_task_id UUID,
  related_decision_id UUID,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## attachments

```sql
CREATE TABLE attachments (
  id UUID PRIMARY KEY,
  message_id UUID,
  project_id UUID,
  product_id UUID,
  task_id UUID,
  uploaded_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## notices

```sql
CREATE TABLE notices (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL,
  message_id UUID,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## notice_reads

```sql
CREATE TABLE notice_reads (
  id UUID PRIMARY KEY,
  notice_id UUID NOT NULL,
  user_id UUID NOT NULL,
  read_at TIMESTAMP,
  confirmed_at TIMESTAMP
);
```

## projects

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT '준비중',
  priority VARCHAR(50) NOT NULL DEFAULT '보통',
  owner_id UUID,
  practical_owner_id UUID,
  start_date DATE,
  due_date DATE,
  completed_at DATE,
  progress INTEGER NOT NULL DEFAULT 0,
  sales_status VARCHAR(50) NOT NULL DEFAULT '준비중',
  sales_block_reason TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## project_members

```sql
CREATE TABLE project_members (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## tasks

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  assignee_id UUID,
  reviewer_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT '할일',
  priority VARCHAR(50) NOT NULL DEFAULT '보통',
  start_date DATE,
  due_date DATE,
  progress INTEGER NOT NULL DEFAULT 0,
  related_message_id UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## products

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  features TEXT,
  application_area TEXT,
  usage_method TEXT,
  caution TEXT,
  sales_status VARCHAR(50) NOT NULL DEFAULT '준비중',
  sales_block_reason TEXT,
  owner_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## product_documents

```sql
CREATE TABLE product_documents (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL,
  attachment_id UUID NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## decisions

```sql
CREATE TABLE decisions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  decided_by UUID NOT NULL,
  decision_date DATE NOT NULL,
  related_message_id UUID,
  related_file_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```
