/**
 * PostgreSQL repository adapter.
 *
 * Active when `DATABASE_URL` is set in the environment (see
 * `server/src/index.ts`). Implemented against the schema produced by
 * `server/src/db/migrations/001_initial.sql` + `002_extend_projects_tasks.sql`
 * + `003_seed_minimum.sql`.
 *
 * Read surface implemented: users, departments, projects, tasks, rooms,
 * messages, products, files, notices. Write surface implemented: every
 * write that the routes currently invoke (user CRUD, department CRUD,
 * project CRUD + members, task CRUD, message append, notice confirm). Several
 * DTO fields (room presence/unread, product spec/lots/history, file folders,
 * notice tone) intentionally fall back to defaults until the underlying
 * tables exist — see README "Postgres adapter 구현 범위" for the matrix.
 */

import type { Pool } from "pg";
import type {
  ChatMessage,
  CreateDepartmentInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateUserInput,
  Department,
  FileEntry,
  FileFolder,
  Notice,
  Product,
  Project,
  ProjectStatus,
  Room,
  SalesStatus,
  TaskItem,
  TaskPriority,
  TaskStatus,
  UpdateDepartmentInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateUserInput,
  User,
  UserRole
} from "@hanmir/shared";
import type {
  DepartmentRepository,
  FileRepository,
  MessageRepository,
  NoticeRepository,
  ProductRepository,
  ProjectRepository,
  Repositories,
  RoomRepository,
  TaskRepository,
  UserRepository
} from "./types";

// TODO(password): swap this placeholder for a real bcrypt/argon2 hash once
// hashing lands. Login currently bypasses password_hash entirely.
const PLACEHOLDER_PASSWORD_HASH = "pending-bcrypt-migration";

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function computeDueState(
  dueDate: Date | string | null,
  status: string
): TaskItem["dueState"] {
  if (!dueDate || status === "done") return undefined;
  const due = typeof dueDate === "string" ? new Date(dueDate) : new Date(dueDate.getTime());
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due.getTime() < today.getTime()) return "late";
  if (due.getTime() === today.getTime()) return "today";
  return "normal";
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  department_id: string | null;
  position: string | null;
  role: string;
  avatar_tone: string | null;
  initials: string | null;
  is_active: boolean;
  department_name: string | null;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    departmentId: row.department_id ?? "",
    departmentName: row.department_name ?? "",
    position: row.position ?? "",
    role: row.role as UserRole,
    avatarTone: (row.avatar_tone ?? "default") as User["avatarTone"],
    initials: row.initials ?? "",
    isActive: row.is_active,
    phone: row.phone ?? undefined
  };
}

const USER_SELECT = `
  SELECT u.id, u.name, u.phone, u.email, u.department_id, u.position, u.role,
         u.avatar_tone, u.initials, u.is_active,
         d.name AS department_name
  FROM users u
  LEFT JOIN departments d ON d.id = u.department_id
`;

class PgUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<User[]> {
    const { rows } = await this.pool.query<UserRow>(
      `${USER_SELECT} ORDER BY u.created_at ASC`
    );
    return rows.map(rowToUser);
  }

  async findById(id: string): Promise<User | undefined> {
    const { rows } = await this.pool.query<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [id]);
    return rows[0] ? rowToUser(rows[0]) : undefined;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const { rows } = await this.pool.query<UserRow>(
      `${USER_SELECT} WHERE LOWER(u.email) = LOWER($1)`,
      [email.trim()]
    );
    return rows[0] ? rowToUser(rows[0]) : undefined;
  }

  async create(input: CreateUserInput): Promise<User> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO users
         (name, phone, email, password_hash, department_id, position, role,
          avatar_tone, initials, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING id`,
      [
        input.name,
        input.phone ?? null,
        input.email,
        PLACEHOLDER_PASSWORD_HASH,
        input.departmentId,
        input.position,
        input.role,
        input.avatarTone ?? "default",
        input.initials ?? input.name.slice(0, 2)
      ]
    );
    const created = await this.findById(rows[0].id);
    if (!created) throw new Error("[postgres] failed to read back created user");
    return created;
  }

  async update(id: string, input: UpdateUserInput): Promise<User | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (input.name !== undefined) { sets.push(`name = $${i++}`); values.push(input.name); }
    if (input.email !== undefined) { sets.push(`email = $${i++}`); values.push(input.email); }
    if (input.phone !== undefined) { sets.push(`phone = $${i++}`); values.push(input.phone); }
    if (input.departmentId !== undefined) {
      sets.push(`department_id = $${i++}`);
      values.push(input.departmentId);
    }
    if (input.position !== undefined) { sets.push(`position = $${i++}`); values.push(input.position); }
    if (input.role !== undefined) { sets.push(`role = $${i++}`); values.push(input.role); }
    if (input.avatarTone !== undefined) {
      sets.push(`avatar_tone = $${i++}`);
      values.push(input.avatarTone);
    }
    if (input.initials !== undefined) {
      sets.push(`initials = $${i++}`);
      values.push(input.initials);
    }
    if (sets.length === 0) return this.findById(id);
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const { rowCount } = await this.pool.query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${i}`,
      values
    );
    if (!rowCount) return undefined;
    return this.findById(id);
  }

  async deactivate(id: string): Promise<User | undefined> {
    const { rowCount } = await this.pool.query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    if (!rowCount) return undefined;
    return this.findById(id);
  }
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

function rowToDept(row: DepartmentRow): Department {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    isActive: row.is_active
  };
}

class PgDepartmentRepository implements DepartmentRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<Department[]> {
    const { rows } = await this.pool.query<DepartmentRow>(
      `SELECT id, name, description, is_active FROM departments
       WHERE is_active IS NOT FALSE
       ORDER BY name ASC`
    );
    return rows.map(rowToDept);
  }

  async findById(id: string): Promise<Department | undefined> {
    const { rows } = await this.pool.query<DepartmentRow>(
      `SELECT id, name, description, is_active FROM departments WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToDept(rows[0]) : undefined;
  }

  async create(input: CreateDepartmentInput): Promise<Department> {
    const { rows } = await this.pool.query<DepartmentRow>(
      `INSERT INTO departments (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, is_active`,
      [input.name, input.description ?? null]
    );
    return rowToDept(rows[0]);
  }

  async update(
    id: string,
    input: UpdateDepartmentInput
  ): Promise<Department | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (input.name !== undefined) { sets.push(`name = $${i++}`); values.push(input.name); }
    if (input.description !== undefined) {
      sets.push(`description = $${i++}`);
      values.push(input.description);
    }
    if (sets.length === 0) return this.findById(id);
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const { rowCount } = await this.pool.query(
      `UPDATE departments SET ${sets.join(", ")} WHERE id = $${i}`,
      values
    );
    if (!rowCount) return undefined;
    return this.findById(id);
  }

  // Matches the memory adapter: refuse delete while active users still
  // reference the department, otherwise hard delete. Soft delete is a TODO.
  async delete(
    id: string
  ): Promise<{ ok: true } | { ok: false; reason: "not_found" | "in_use" }> {
    const inUse = await this.pool.query(
      `SELECT 1 FROM users WHERE department_id = $1 AND is_active IS NOT FALSE LIMIT 1`,
      [id]
    );
    if (inUse.rows.length > 0) return { ok: false, reason: "in_use" };
    const { rowCount } = await this.pool.query(`DELETE FROM departments WHERE id = $1`, [id]);
    if (!rowCount) return { ok: false, reason: "not_found" };
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  code: string | null;
  name: string;
  full_name: string | null;
  status: string;
  stage_label: string | null;
  department: string | null;
  owner_name: string | null;
  start_date: Date | null;
  due_date: Date | null;
  progress: number;
  description: string | null;
  goals: string[] | null;
  outputs: string[] | null;
  budget: string | null;
  type: string | null;
  external_partners: string | null;
  related_product_ids: string[] | null;
  sales_status: string | null;
  member_ids: string[] | null;
  done_count: string | number | null;
  in_progress_count: string | number | null;
  pending_count: string | number | null;
  total_count: string | number | null;
  delayed_count: string | number | null;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    code: row.code ?? "",
    name: row.name,
    fullName: row.full_name ?? row.name,
    status: row.status as ProjectStatus,
    stageLabel: row.stage_label ?? "",
    department: row.department ?? "",
    ownerName: row.owner_name ?? "",
    startDate: formatDate(row.start_date),
    dueDate: formatDate(row.due_date),
    progress: row.progress ?? 0,
    taskCounts: {
      done: Number(row.done_count) || 0,
      inProgress: Number(row.in_progress_count) || 0,
      pending: Number(row.pending_count) || 0,
      total: Number(row.total_count) || 0
    },
    delayedCount: Number(row.delayed_count) || 0,
    description: row.description ?? "",
    goals: row.goals ?? [],
    outputs: row.outputs ?? [],
    memberIds: row.member_ids ?? [],
    budget: row.budget ?? undefined,
    type: row.type ?? undefined,
    externalPartners: row.external_partners ?? undefined,
    relatedProductIds: row.related_product_ids ?? undefined,
    milestones: [],
    salesStatus: (row.sales_status as SalesStatus | null) ?? undefined
  };
}

const PROJECT_SELECT = `
  SELECT
    p.id, p.code, p.name, p.full_name, p.status, p.stage_label,
    p.department, p.owner_name, p.start_date, p.due_date, p.progress,
    p.description, p.goals, p.outputs, p.budget, p.type,
    p.external_partners, p.related_product_ids, p.sales_status,
    COALESCE(
      (SELECT array_agg(pm.user_id ORDER BY pm.created_at)
         FROM project_members pm WHERE pm.project_id = p.id),
      ARRAY[]::UUID[]
    ) AS member_ids,
    COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done'), 0) AS done_count,
    COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status IN ('in_progress','review')), 0) AS in_progress_count,
    COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status IN ('todo','on_hold')), 0) AS pending_count,
    COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id), 0) AS total_count,
    COALESCE(
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id
         AND t.status NOT IN ('done')
         AND t.due_date IS NOT NULL
         AND t.due_date < CURRENT_DATE),
      0
    ) AS delayed_count
  FROM projects p
`;

class PgProjectRepository implements ProjectRepository {
  constructor(private readonly pool: Pool, private readonly _users: PgUserRepository) {}

  async list(): Promise<Project[]> {
    const { rows } = await this.pool.query<ProjectRow>(
      `${PROJECT_SELECT} ORDER BY p.created_at ASC`
    );
    return rows.map(rowToProject);
  }

  async findById(id: string): Promise<Project | undefined> {
    const { rows } = await this.pool.query<ProjectRow>(
      `${PROJECT_SELECT} WHERE p.id = $1`,
      [id]
    );
    return rows[0] ? rowToProject(rows[0]) : undefined;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    // `created_by` is NOT NULL in the schema. For MVP we look up any
    // super_admin (or the first user) since there is no `currentUser` plumbed
    // into the repository. The audit story is tracked in TODO.
    const { rows: anyUser } = await this.pool.query<{ id: string }>(
      `SELECT id FROM users WHERE role IN ('super_admin','admin') AND is_active LIMIT 1`
    );
    if (anyUser.length === 0) {
      throw new Error(
        "[postgres] cannot create a project: no admin user available as created_by"
      );
    }
    const createdBy = anyUser[0].id;
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO projects (
         code, name, full_name, status, stage_label, department, owner_name,
         start_date, due_date, progress, description, goals, outputs, budget,
         type, external_partners, related_product_ids, sales_status, created_by
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, 0, $10, $11, $12, $13,
         $14, $15, $16, $17, $18
       )
       RETURNING id`,
      [
        input.code ?? null,
        input.name,
        input.fullName ?? input.name,
        input.status ?? "ready",
        input.stageLabel ?? null,
        input.department ?? null,
        input.ownerName ?? null,
        input.startDate || null,
        input.dueDate || null,
        input.description ?? null,
        input.goals ?? [],
        input.outputs ?? [],
        input.budget ?? null,
        input.type ?? null,
        input.externalPartners ?? null,
        input.relatedProductIds ?? [],
        // `projects.sales_status` is NOT NULL. The schema's column default is
        // the Korean label '준비중', which doesn't match the app's enum keys
        // (preparing/unavailable/internal/conditional/available). Default to
        // the enum value here so reads round-trip cleanly through SalesStatus.
        input.salesStatus ?? "preparing",
        createdBy
      ]
    );
    // initial member list, if any
    if (input.memberIds && input.memberIds.length > 0) {
      for (const memberId of input.memberIds) {
        await this.pool.query(
          `INSERT INTO project_members (project_id, user_id, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (project_id, user_id) DO NOTHING`,
          [rows[0].id, memberId]
        );
      }
    }
    const created = await this.findById(rows[0].id);
    if (!created) throw new Error("[postgres] failed to read back created project");
    return created;
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      values.push(val);
    };
    if (input.code !== undefined) add("code", input.code);
    if (input.name !== undefined) add("name", input.name);
    if (input.fullName !== undefined) add("full_name", input.fullName);
    if (input.status !== undefined) add("status", input.status);
    if (input.stageLabel !== undefined) add("stage_label", input.stageLabel);
    if (input.department !== undefined) add("department", input.department);
    if (input.ownerName !== undefined) add("owner_name", input.ownerName);
    if (input.startDate !== undefined) add("start_date", input.startDate || null);
    if (input.dueDate !== undefined) add("due_date", input.dueDate || null);
    if (input.progress !== undefined) add("progress", input.progress);
    if (input.description !== undefined) add("description", input.description);
    if (input.goals !== undefined) add("goals", input.goals);
    if (input.outputs !== undefined) add("outputs", input.outputs);
    if (input.budget !== undefined) add("budget", input.budget);
    if (input.type !== undefined) add("type", input.type);
    if (input.externalPartners !== undefined) add("external_partners", input.externalPartners);
    if (input.relatedProductIds !== undefined)
      add("related_product_ids", input.relatedProductIds);
    if (input.salesStatus !== undefined) add("sales_status", input.salesStatus);
    if (sets.length === 0) return this.findById(id);
    sets.push("updated_at = NOW()");
    values.push(id);
    const { rowCount } = await this.pool.query(
      `UPDATE projects SET ${sets.join(", ")} WHERE id = $${i}`,
      values
    );
    if (!rowCount) return undefined;
    return this.findById(id);
  }

  async cancel(id: string): Promise<Project | undefined> {
    const { rowCount } = await this.pool.query(
      `UPDATE projects SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    if (!rowCount) return undefined;
    return this.findById(id);
  }

  async addMember(id: string, userId: string): Promise<Project | undefined> {
    const project = await this.findById(id);
    if (!project) return undefined;
    await this.pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [id, userId]
    );
    return this.findById(id);
  }

  async removeMember(id: string, userId: string): Promise<Project | undefined> {
    const project = await this.findById(id);
    if (!project) return undefined;
    await this.pool.query(
      `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [id, userId]
    );
    return this.findById(id);
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  code: string | null;
  project_id: string;
  title: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  reviewer_id: string | null;
  start_date: Date | null;
  due_date: Date | null;
  due_label: string | null;
  progress: number;
}

function rowToTask(row: TaskRow): TaskItem {
  const dueDate = formatDate(row.due_date);
  return {
    id: row.id,
    code: row.code ?? "",
    projectId: row.project_id,
    title: row.title,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    assigneeIds: row.assignee_id ? [row.assignee_id] : [],
    reviewerId: row.reviewer_id ?? undefined,
    startDate: row.start_date ? formatDate(row.start_date) : undefined,
    dueDate: row.due_date ? dueDate : undefined,
    dueLabel: row.due_label ?? dueDate ?? "미정",
    dueState: computeDueState(row.due_date, row.status),
    progress: row.progress ?? 0
  };
}

const TASK_SELECT = `
  SELECT id, code, project_id, title, status, priority, assignee_id,
         reviewer_id, start_date, due_date, due_label, progress
  FROM tasks
`;

class PgTaskRepository implements TaskRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<TaskItem[]> {
    const { rows } = await this.pool.query<TaskRow>(
      `${TASK_SELECT} ORDER BY created_at ASC`
    );
    return rows.map(rowToTask);
  }

  async listByProject(projectId: string): Promise<TaskItem[]> {
    const { rows } = await this.pool.query<TaskRow>(
      `${TASK_SELECT} WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId]
    );
    return rows.map(rowToTask);
  }

  async findById(id: string): Promise<TaskItem | undefined> {
    const { rows } = await this.pool.query<TaskRow>(`${TASK_SELECT} WHERE id = $1`, [id]);
    return rows[0] ? rowToTask(rows[0]) : undefined;
  }

  async create(projectId: string, input: CreateTaskInput): Promise<TaskItem> {
    // Same created_by limitation as Project.create — pick any admin until the
    // current-user context is plumbed in.
    const { rows: anyUser } = await this.pool.query<{ id: string }>(
      `SELECT id FROM users WHERE role IN ('super_admin','admin') AND is_active LIMIT 1`
    );
    if (anyUser.length === 0) {
      throw new Error("[postgres] cannot create a task: no admin user available as created_by");
    }
    const createdBy = anyUser[0].id;
    // TODO(assignees): schema stores a single `assignee_id`; persist only the
    // first id from the request and document the limitation in README.
    const firstAssignee = input.assigneeIds?.[0] ?? null;
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO tasks (
         code, project_id, title, description, assignee_id, reviewer_id,
         status, priority, start_date, due_date, due_label, progress, created_by
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, COALESCE($12, 0), $13
       )
       RETURNING id`,
      [
        input.code ?? null,
        projectId,
        input.title,
        input.description ?? null,
        firstAssignee,
        input.reviewerId ?? null,
        input.status ?? "todo",
        input.priority ?? "normal",
        input.startDate || null,
        input.dueDate || null,
        input.dueLabel ?? input.dueDate ?? null,
        input.progress ?? null,
        createdBy
      ]
    );
    const created = await this.findById(rows[0].id);
    if (!created) throw new Error("[postgres] failed to read back created task");
    return created;
  }

  async update(id: string, input: UpdateTaskInput): Promise<TaskItem | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const add = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      values.push(val);
    };
    if (input.title !== undefined) add("title", input.title);
    if (input.code !== undefined) add("code", input.code);
    if (input.status !== undefined) add("status", input.status);
    if (input.priority !== undefined) add("priority", input.priority);
    if (input.assigneeIds !== undefined) add("assignee_id", input.assigneeIds[0] ?? null);
    if (input.reviewerId !== undefined) add("reviewer_id", input.reviewerId);
    if (input.startDate !== undefined) add("start_date", input.startDate || null);
    if (input.dueDate !== undefined) add("due_date", input.dueDate || null);
    if (input.dueLabel !== undefined) add("due_label", input.dueLabel);
    if (input.progress !== undefined) add("progress", input.progress);
    if (input.description !== undefined) add("description", input.description);
    if (sets.length === 0) return this.findById(id);
    sets.push("updated_at = NOW()");
    values.push(id);
    const { rowCount } = await this.pool.query(
      `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${i}`,
      values
    );
    if (!rowCount) return undefined;
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM tasks WHERE id = $1`, [id]);
    return Boolean(rowCount);
  }
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

interface RoomRow {
  id: string;
  name: string;
  type: string;
  project_id: string | null;
  member_user_ids: string[] | null;
  member_roles: string[] | null;
  last_message_at: Date | null;
  last_message_preview: string | null;
  last_message_author: string | null;
}

function rowToRoom(row: RoomRow): Room {
  const userIds = row.member_user_ids ?? [];
  const roles = row.member_roles ?? [];
  const members = userIds.map((userId, idx) => ({
    userId,
    isOwner: roles[idx] === "owner" || roles[idx] === "creator" || undefined,
    isManager: roles[idx] === "manager" || undefined
  }));
  return {
    id: row.id,
    name: row.name,
    type: row.type as Room["type"],
    projectId: row.project_id ?? undefined,
    members,
    // TODO(unread): per-user unread requires joining `room_members.last_read_message_id`
    // against the latest message id for the current user. Plumb currentUser
    // through the repository or surface a separate `unreadFor(userId, roomId)`.
    unread: 0,
    lastMessageAt: row.last_message_at ? formatDate(row.last_message_at) : "",
    lastMessagePreview: row.last_message_preview ?? "",
    lastMessageAuthor: row.last_message_author ?? undefined
  };
}

const ROOM_SELECT = `
  SELECT
    r.id, r.name, r.type, r.project_id,
    COALESCE(
      (SELECT array_agg(rm.user_id ORDER BY rm.joined_at)
         FROM room_members rm WHERE rm.room_id = r.id),
      ARRAY[]::UUID[]
    ) AS member_user_ids,
    COALESCE(
      (SELECT array_agg(rm.role ORDER BY rm.joined_at)
         FROM room_members rm WHERE rm.room_id = r.id),
      ARRAY[]::VARCHAR[]
    ) AS member_roles,
    (SELECT m.created_at FROM messages m
       WHERE m.room_id = r.id AND NOT m.is_deleted
       ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
    (SELECT m.content FROM messages m
       WHERE m.room_id = r.id AND NOT m.is_deleted
       ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
    (SELECT u.name FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.room_id = r.id AND NOT m.is_deleted
       ORDER BY m.created_at DESC LIMIT 1) AS last_message_author
  FROM rooms r
  WHERE r.is_active IS NOT FALSE
`;

class PgRoomRepository implements RoomRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<Room[]> {
    const { rows } = await this.pool.query<RoomRow>(
      `${ROOM_SELECT} ORDER BY r.created_at DESC`
    );
    return rows.map(rowToRoom);
  }

  async findById(id: string): Promise<Room | undefined> {
    const { rows } = await this.pool.query<RoomRow>(
      `${ROOM_SELECT.replace("WHERE r.is_active IS NOT FALSE", "WHERE r.id = $1 AND r.is_active IS NOT FALSE")}`,
      [id]
    );
    return rows[0] ? rowToRoom(rows[0]) : undefined;
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

interface MessageRow {
  id: string;
  room_id: string;
  user_id: string;
  author_name: string | null;
  author_position: string | null;
  author_department: string | null;
  author_avatar_tone: string | null;
  author_initials: string | null;
  content: string | null;
  message_type: string;
  created_at: Date;
  attachment_id: string | null;
  attachment_name: string | null;
  attachment_size: string | number | null;
  attachment_type: string | null;
}

function rowToMessage(row: MessageRow): ChatMessage {
  const role =
    row.author_position && row.author_department
      ? `${row.author_position} · ${row.author_department}`
      : row.author_position ?? undefined;
  const message: ChatMessage = {
    id: row.id,
    roomId: row.room_id,
    authorId: row.user_id,
    authorName: row.author_name ?? "",
    authorRole: role,
    avatarTone: (row.author_avatar_tone ?? "default") as ChatMessage["avatarTone"],
    initials: row.author_initials ?? "",
    body: row.content ?? "",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    isSystem: row.message_type === "system" || undefined
  };
  if (row.attachment_id && row.attachment_name) {
    message.attachment = {
      id: row.attachment_id,
      kind: deriveFileKind(row.attachment_name, row.attachment_type),
      name: row.attachment_name,
      meta: row.attachment_size ? `${formatBytes(Number(row.attachment_size))}` : ""
    };
  }
  return message;
}

const MESSAGE_SELECT = `
  SELECT
    m.id, m.room_id, m.user_id, m.content, m.message_type, m.created_at,
    u.name AS author_name, u.position AS author_position,
    u.avatar_tone AS author_avatar_tone, u.initials AS author_initials,
    d.name AS author_department,
    a.id AS attachment_id, a.file_name AS attachment_name,
    a.file_size AS attachment_size, a.file_type AS attachment_type
  FROM messages m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN LATERAL (
    SELECT id, file_name, file_size, file_type
    FROM attachments
    WHERE message_id = m.id
    ORDER BY created_at ASC
    LIMIT 1
  ) a ON true
`;

class PgMessageRepository implements MessageRepository {
  constructor(private readonly pool: Pool) {}

  async listByRoom(roomId: string): Promise<ChatMessage[]> {
    const { rows } = await this.pool.query<MessageRow>(
      `${MESSAGE_SELECT} WHERE m.room_id = $1 AND NOT m.is_deleted ORDER BY m.created_at ASC`,
      [roomId]
    );
    return rows.map(rowToMessage);
  }

  async append(roomId: string, message: ChatMessage): Promise<ChatMessage> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO messages (room_id, user_id, content, message_type)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [roomId, message.authorId, message.body, message.isSystem ? "system" : "text"]
    );
    const { rows: persisted } = await this.pool.query<MessageRow>(
      `${MESSAGE_SELECT} WHERE m.id = $1`,
      [rows[0].id]
    );
    if (persisted.length === 0) {
      throw new Error("[postgres] failed to read back appended message");
    }
    return rowToMessage(persisted[0]);
  }

  // The current schema has no `pinned` flag on messages. Pinned messages will
  // be modelled in a future migration (e.g. `room_pinned_messages`). Until
  // then `getPinned` returns undefined in postgres mode so the chat header
  // simply omits the pinned banner.
  async getPinned(_roomId: string): Promise<{ author: string; body: string } | undefined> {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  features: string | null;
  application_area: string | null;
  caution: string | null;
  sales_status: string | null;
  sales_block_reason: string | null;
  owner_id: string | null;
}

function rowToProduct(row: ProductRow): Product {
  const splitToList = (s: string | null): string[] =>
    s ? s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [];
  return {
    id: row.id,
    code: "",
    name: row.name,
    fullName: row.name,
    category: row.category ?? "",
    subCategory: "",
    description: row.description ?? "",
    features: splitToList(row.features),
    applications: splitToList(row.application_area),
    cautions: splitToList(row.caution),
    salesStatus: (row.sales_status as SalesStatus | null) ?? "preparing",
    salesNote: row.sales_block_reason ?? "",
    salesUpdatedAt: "",
    salesUpdatedBy: "",
    ownerId: row.owner_id ?? "",
    // The DTO carries denormalized aggregates that the current schema does not
    // back. Until product_documents / product_lots / sales_status_events are
    // joined in, we return empty arrays so the UI renders an empty state
    // instead of crashing.
    spec: [],
    lots: [],
    history: [],
    relatedProjectIds: [],
    documents: [],
    quarter: {
      totalKg: "",
      revenue: "",
      avgPrice: "",
      topClient: "",
      targetRatio: 0
    }
  };
}

const PRODUCT_SELECT = `
  SELECT id, name, category, description, features, application_area,
         caution, sales_status, sales_block_reason, owner_id
  FROM products
`;

class PgProductRepository implements ProductRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<Product[]> {
    const { rows } = await this.pool.query<ProductRow>(
      `${PRODUCT_SELECT} ORDER BY created_at DESC`
    );
    return rows.map(rowToProduct);
  }

  async findById(id: string): Promise<Product | undefined> {
    const { rows } = await this.pool.query<ProductRow>(
      `${PRODUCT_SELECT} WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToProduct(rows[0]) : undefined;
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

interface AttachmentRow {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: string | number | null;
  uploaded_by: string;
  project_id: string | null;
  product_id: string | null;
  task_id: string | null;
  created_at: Date;
}

function deriveFileKind(filename: string, mime: string | null): FileEntry["kind"] {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["xls", "xlsx", "csv"].includes(ext)) return "xls";
  if (["doc", "docx", "hwp", "hwpx"].includes(ext)) return "doc";
  if (["ppt", "pptx"].includes(ext)) return "ppt";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "img";
  if (["zip", "rar", "7z"].includes(ext)) return "zip";
  if (mime?.startsWith("image/")) return "img";
  if (mime?.includes("pdf")) return "pdf";
  if (mime?.includes("spreadsheet") || mime?.includes("excel")) return "xls";
  if (mime?.includes("presentation") || mime?.includes("powerpoint")) return "ppt";
  return "doc";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function rowToFile(row: AttachmentRow): FileEntry {
  const scope = row.project_id
    ? "프로젝트"
    : row.product_id
    ? "제품정보"
    : row.task_id
    ? "업무"
    : "공유";
  return {
    id: row.id,
    kind: deriveFileKind(row.file_name, row.file_type),
    name: row.file_name,
    scope,
    size: row.file_size != null ? formatBytes(Number(row.file_size)) : "",
    uploaderId: row.uploaded_by,
    uploadedAt: row.created_at instanceof Date ? formatDate(row.created_at) : String(row.created_at)
  };
}

const ATTACHMENT_SELECT = `
  SELECT id, file_name, file_type, file_size, uploaded_by, project_id,
         product_id, task_id, created_at
  FROM attachments
`;

class PgFileRepository implements FileRepository {
  constructor(private readonly pool: Pool) {}

  // No folders table exists in the current schema; folders are a UI-only
  // construct seeded in memory. Returning [] keeps the file library page from
  // throwing while leaving the door open for a later `file_folders` table.
  async listFolders(): Promise<FileFolder[]> {
    return [];
  }

  async listFiles(): Promise<FileEntry[]> {
    const { rows } = await this.pool.query<AttachmentRow>(
      `${ATTACHMENT_SELECT} ORDER BY created_at DESC`
    );
    return rows.map(rowToFile);
  }

  async findById(id: string): Promise<FileEntry | undefined> {
    const { rows } = await this.pool.query<AttachmentRow>(
      `${ATTACHMENT_SELECT} WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToFile(rows[0]) : undefined;
  }
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

interface NoticeRow {
  id: string;
  title: string;
  content: string;
  is_required: boolean;
  created_at: Date;
  created_by: string;
  author_team: string | null;
  confirmed_count: string | number | null;
  total_recipients: string | number | null;
  my_confirmed: boolean | null;
}

function rowToNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    title: row.title,
    body: row.content,
    authorTeam: row.author_team ?? "",
    createdAt: row.created_at instanceof Date ? formatDate(row.created_at) : String(row.created_at),
    isMandatory: row.is_required,
    totalRecipients: Number(row.total_recipients) || 0,
    confirmedCount: Number(row.confirmed_count) || 0,
    myConfirmed: Boolean(row.my_confirmed),
    // Schema has no `tone` column. Map mandatory notices to red and the rest
    // to green so the UI bucketing still works. TODO: add a column or derive
    // tone from a richer state machine.
    tone: row.is_required ? "red" : "green"
  };
}

const NOTICE_SELECT = `
  SELECT
    n.id, n.title, n.content, n.is_required, n.created_at, n.created_by,
    d.name AS author_team,
    COALESCE((SELECT COUNT(*) FROM notice_reads nr
              WHERE nr.notice_id = n.id AND nr.confirmed_at IS NOT NULL), 0)
      AS confirmed_count,
    COALESCE((SELECT COUNT(*) FROM users u WHERE u.is_active), 0)
      AS total_recipients,
    EXISTS (
      SELECT 1 FROM notice_reads nr
      WHERE nr.notice_id = n.id AND nr.user_id = $1 AND nr.confirmed_at IS NOT NULL
    ) AS my_confirmed
  FROM notices n
  LEFT JOIN users author ON author.id = n.created_by
  LEFT JOIN departments d ON d.id = author.department_id
`;

class PgNoticeRepository implements NoticeRepository {
  constructor(private readonly pool: Pool) {}

  async list(userId?: string): Promise<Notice[]> {
    const { rows } = await this.pool.query<NoticeRow>(
      `${NOTICE_SELECT} ORDER BY n.created_at DESC`,
      [userId ?? null]
    );
    return rows.map(rowToNotice);
  }

  async findById(id: string, userId?: string): Promise<Notice | undefined> {
    const { rows } = await this.pool.query<NoticeRow>(
      `${NOTICE_SELECT} WHERE n.id = $2`,
      [userId ?? null, id]
    );
    return rows[0] ? rowToNotice(rows[0]) : undefined;
  }

  async markConfirmed(id: string, userId: string): Promise<Notice | undefined> {
    // Ensure notice exists; the join in the SELECT below would return rows
    // with NULL fields if we skipped this check.
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM notices WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) return undefined;
    await this.pool.query(
      `INSERT INTO notice_reads (notice_id, user_id, read_at, confirmed_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (notice_id, user_id)
       DO UPDATE SET confirmed_at = NOW()`,
      [id, userId]
    );
    return this.findById(id, userId);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPostgresRepositories(pool: Pool): Repositories {
  const users = new PgUserRepository(pool);
  return {
    users,
    departments: new PgDepartmentRepository(pool),
    rooms: new PgRoomRepository(pool),
    messages: new PgMessageRepository(pool),
    projects: new PgProjectRepository(pool, users),
    tasks: new PgTaskRepository(pool),
    products: new PgProductRepository(pool),
    files: new PgFileRepository(pool),
    notices: new PgNoticeRepository(pool)
  };
}
