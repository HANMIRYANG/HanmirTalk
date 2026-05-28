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

import { createHash, randomBytes } from "crypto";
import type { Pool } from "pg";
import { hashPassword, seedPasswordHash, verifyPassword } from "../auth/password";
import type {
  AuditEntry,
  AuditLogPage,
  AuditLogQuery,
  AuditLogRow,
  ChatMessage,
  CreateAuditInput,
  CreateDecisionInput,
  CreateDepartmentInput,
  CreateFileInput,
  CreateNoticeInput,
  CreateProductInput,
  CreateProjectInput,
  CreateRoomInput,
  CreateTaskInput,
  CreateUserInput,
  Decision,
  DecisionReadStatus,
  DecisionReadStatusEntry,
  Department,
  FileEntry,
  FileFolder,
  ListFilesFilter,
  MessageEntity,
  Notice,
  NoticeReadStatus,
  NoticeReadStatusEntry,
  Notification,
  NotificationSettings,
  OrgNotificationDefault,
  PinnedMessageRef,
  Product,
  ProductDocument,
  ProductDocumentType,
  ProductLot,
  ProductSpec,
  Project,
  ProjectStatus,
  Room,
  RoomType,
  SalesStatus,
  SalesStatusEvent,
  TaskItem,
  TaskPriority,
  TaskStatus,
  CreateProductLotInput,
  CreateProductSpecInput,
  UpdateDecisionInput,
  UpdateDepartmentInput,
  UpdateNotificationSettingsInput,
  UpdateProductInput,
  UpdateProductLotInput,
  UpdateProductSpecInput,
  UpdateProjectInput,
  UpdateRoomInput,
  UpdateTaskInput,
  UpdateUserInput,
  User,
  UserInvitation,
  UserRole
} from "@hanmir/shared";
import { NOTIFICATION_CATEGORIES } from "@hanmir/shared";
import type {
  AuditRepository,
  CreateNotificationInput,
  CreatePushSubscriptionInput,
  DecisionRepository,
  DepartmentRepository,
  OrgNotificationRepository,
  FileRepository,
  InvitationRepository,
  IssuedRefreshToken,
  MessageRepository,
  NoticeRepository,
  NotificationRepository,
  ProductRepository,
  ProjectRepository,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
  RefreshTokenRepository,
  Repositories,
  ResolvedRefreshToken,
  RoomRepository,
  TaskRepository,
  UserRepository
} from "./types";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// (Phase 1 D-1) bcryptjs-based password storage. Seed users have their
// password_hash set by migration 006 to bcrypt('hanmir1234'); newly-created
// users get their own hash inserted via PgUserRepository.create.

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
  must_change_password: boolean | null;
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
    phone: row.phone ?? undefined,
    mustChangePassword: row.must_change_password ?? false
  };
}

const USER_SELECT = `
  SELECT u.id, u.name, u.phone, u.email, u.department_id, u.position, u.role,
         u.avatar_tone, u.initials, u.is_active, u.must_change_password,
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
          avatar_tone, initials, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
       RETURNING id`,
      [
        input.name,
        input.phone ?? null,
        input.email,
        // Explicit password hashed immediately; otherwise reuse the seed
        // hash so the new user can log in with DEFAULT_PASSWORD until they
        // change it. must_change_password=true forces that change.
        input.password ? hashPassword(input.password) : seedPasswordHash,
        input.departmentId,
        input.position,
        input.role,
        input.avatarTone ?? "default",
        input.initials ?? input.name.slice(0, 2),
        // Trust users who supplied their own password (invitation flow).
        // Admin-issued accounts must rotate before any other action.
        !input.password
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

  async verifyPassword(userId: string, plain: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId]
    );
    if (!rows[0]) return false;
    return verifyPassword(plain, rows[0].password_hash);
  }

  async setPassword(userId: string, plain: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
          SET password_hash = $1,
              must_change_password = false,
              updated_at = NOW()
        WHERE id = $2`,
      [hashPassword(plain), userId]
    );
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
  constructor(private readonly pool: Pool) {}

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
  description: string | null;
  project_id: string | null;
  pinned_message_id: string | null;
  member_user_ids: string[] | null;
  member_roles: string[] | null;
  last_message_at: Date | null;
  last_message_preview: string | null;
  last_message_author: string | null;
  unread_count: string | number | null;
  // Phase 4 G-1 — per-user mute (room_members.notification_enabled is
  // false when muted; we surface as `muted: true` for clarity). NULL when
  // the caller has no row in this room.
  caller_muted: boolean | null;
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
    description: row.description ?? undefined,
    projectId: row.project_id ?? undefined,
    pinnedMessageId: row.pinned_message_id ?? undefined,
    members,
    unread: Number(row.unread_count) || 0,
    muted: row.caller_muted ?? undefined,
    lastMessageAt: row.last_message_at ? formatDate(row.last_message_at) : "",
    lastMessagePreview: row.last_message_preview ?? "",
    lastMessageAuthor: row.last_message_author ?? undefined
  };
}

// `$1` is the current user id (nullable — pass NULL when unauth) and is
// reused for the unread subquery. Callers must add the `$2 ...` predicate
// at the WHERE site themselves so list/findById share the same shape.
const ROOM_SELECT = `
  SELECT
    r.id, r.name, r.type, r.description, r.project_id, r.pinned_message_id,
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
       ORDER BY m.created_at DESC LIMIT 1) AS last_message_author,
    -- Per-user mute. NULL when caller has no room_members row; UI treats
    -- NULL as "not muted" anyway. notification_enabled=false ⇒ muted.
    (SELECT NOT rm3.notification_enabled FROM room_members rm3
       WHERE rm3.room_id = r.id AND rm3.user_id = $1) AS caller_muted,
    -- Unread = messages newer than this user's last_read_message and not
    -- authored by them. last_read_message resolves via room_members; when
    -- the user has no row, we treat every foreign message as unread.
    CASE
      WHEN $1::UUID IS NULL THEN 0
      ELSE (
        SELECT COUNT(*) FROM messages mu
        WHERE mu.room_id = r.id
          AND NOT mu.is_deleted
          AND mu.user_id <> $1
          AND mu.created_at > COALESCE(
            (SELECT mm.created_at FROM messages mm
              WHERE mm.id = (
                SELECT rm2.last_read_message_id
                FROM room_members rm2
                WHERE rm2.room_id = r.id AND rm2.user_id = $1
              )),
            TIMESTAMP 'epoch'
          )
      )
    END AS unread_count
  FROM rooms r
  WHERE r.is_active IS NOT FALSE
`;

class PgRoomRepository implements RoomRepository {
  constructor(private readonly pool: Pool) {}

  async list(userId?: string): Promise<Room[]> {
    const { rows } = await this.pool.query<RoomRow>(
      `${ROOM_SELECT} ORDER BY r.created_at DESC`,
      [userId ?? null]
    );
    return rows.map(rowToRoom);
  }

  async findById(id: string, userId?: string): Promise<Room | undefined> {
    const { rows } = await this.pool.query<RoomRow>(
      `${ROOM_SELECT.replace(
        "WHERE r.is_active IS NOT FALSE",
        "WHERE r.id = $2 AND r.is_active IS NOT FALSE"
      )}`,
      [userId ?? null, id]
    );
    return rows[0] ? rowToRoom(rows[0]) : undefined;
  }

  async create(input: CreateRoomInput, createdBy: { id: string }): Promise<Room> {
    const type: RoomType = input.type ?? "group";
    const memberSet = new Set<string>([createdBy.id, ...(input.memberIds ?? [])]);
    // Insert + add members in one transaction so a partial failure doesn't
    // leave an orphaned room (no members → can't be listed by anyone).
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO rooms (name, type, description, project_id, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [input.name, type, input.description ?? null, input.projectId ?? null, createdBy.id]
      );
      const roomId = rows[0].id;
      for (const uid of memberSet) {
        await client.query(
          `INSERT INTO room_members (room_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (room_id, user_id) DO NOTHING`,
          [roomId, uid, uid === createdBy.id ? "owner" : "member"]
        );
      }
      await client.query("COMMIT");
      const created = await this.findById(roomId, createdBy.id);
      if (!created) throw new Error("[postgres] failed to read back created room");
      return created;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async update(id: string, input: UpdateRoomInput): Promise<Room | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.name !== undefined) add("name", input.name);
    if (input.description !== undefined) add("description", input.description);
    if (sets.length === 0) return this.findById(id);
    sets.push("updated_at = NOW()");
    params.push(id);
    const { rowCount } = await this.pool.query(
      `UPDATE rooms SET ${sets.join(", ")}
        WHERE id = $${params.length} AND is_active IS NOT FALSE`,
      params
    );
    if (!rowCount) return undefined;
    return this.findById(id);
  }

  async findOrCreateDirect(userIdA: string, userIdB: string): Promise<Room> {
    // Find any active direct room whose membership is exactly {A, B}.
    // The HAVING + COUNT trick lets us pin "exactly two members, both of
    // which are A or B" without ambiguity.
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT r.id
         FROM rooms r
         JOIN room_members rm ON rm.room_id = r.id
        WHERE r.type = 'direct'
          AND r.is_active IS NOT FALSE
          AND rm.user_id IN ($1, $2)
        GROUP BY r.id
       HAVING COUNT(*) = 2
          AND (SELECT COUNT(*) FROM room_members rm2 WHERE rm2.room_id = r.id) = 2
        LIMIT 1`,
      [userIdA, userIdB]
    );
    if (rows[0]) {
      const existing = await this.findById(rows[0].id, userIdA);
      if (existing) return existing;
    }
    return this.create(
      { name: "1:1 대화", type: "direct", memberIds: [userIdB] },
      { id: userIdA }
    );
  }

  async addMember(id: string, userId: string): Promise<Room | undefined> {
    const exists = await this.pool.query<{ id: string }>(
      `SELECT id FROM rooms WHERE id = $1 AND is_active IS NOT FALSE`,
      [id]
    );
    if (exists.rows.length === 0) return undefined;
    await this.pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [id, userId]
    );
    return this.findById(id, userId);
  }

  async removeMember(id: string, userId: string): Promise<Room | undefined> {
    const exists = await this.pool.query<{ id: string }>(
      `SELECT id FROM rooms WHERE id = $1`,
      [id]
    );
    if (exists.rows.length === 0) return undefined;
    await this.pool.query(
      `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [id, userId]
    );
    return this.findById(id);
  }

  async setMute(id: string, userId: string, muted: boolean): Promise<Room | undefined> {
    // notification_enabled is the inverse of `muted`. UPDATE only — the
    // caller must already be a member (D-8 route layer guarantees this).
    const { rowCount } = await this.pool.query(
      `UPDATE room_members SET notification_enabled = $3
        WHERE room_id = $1 AND user_id = $2`,
      [id, userId, !muted]
    );
    if (!rowCount) {
      // Not a member of an existing room: nothing to mute. Returning the
      // room (if it exists) keeps the API uniform — the muted flag will
      // just be undefined.
      return this.findById(id, userId);
    }
    return this.findById(id, userId);
  }

  async leave(
    id: string,
    userId: string
  ): Promise<{ ok: true; archived: boolean } | { ok: false }> {
    const exists = await this.pool.query<{ id: string }>(
      `SELECT id FROM rooms WHERE id = $1`,
      [id]
    );
    if (exists.rows.length === 0) return { ok: false };
    await this.pool.query(
      `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [id, userId]
    );
    const remaining = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM room_members WHERE room_id = $1`,
      [id]
    );
    const count = Number(remaining.rows[0]?.c ?? 0);
    if (count === 0) {
      // Soft archive — historical messages keep their fk references.
      await this.pool.query(
        `UPDATE rooms SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [id]
      );
      return { ok: true, archived: true };
    }
    return { ok: true, archived: false };
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
  edited_at: Date | null;
  is_deleted: boolean;
  // Phase 5 H-1 — entity / AI provenance columns from migration 013.
  entities: unknown;
  ai_generated: boolean;
  ai_command: string | null;
  source_message_ids: string[] | null;
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
  // Phase 2 E-1 — mask the body and drop attachments for soft-deleted
  // rows so the API never leaks the original content. The frontend just
  // renders the body verbatim.
  const isDeleted = Boolean(row.is_deleted);
  const body = isDeleted ? "삭제된 메시지입니다" : row.content ?? "";
  // Phase 5 H-1 — entities is a JSONB column; pg returns it as a parsed
  // JS value (array of objects). Filter to expected shape just in case.
  const rawEntities = Array.isArray(row.entities) ? row.entities : [];
  const entities: MessageEntity[] | undefined = isDeleted
    ? undefined
    : (rawEntities as Record<string, unknown>[])
        .filter((e) => e && typeof e === "object" && typeof e.type === "string")
        .map((e) => ({
          type: e.type as MessageEntity["type"],
          id: String(e.id ?? ""),
          label: String(e.label ?? ""),
          offset: Number(e.offset ?? 0),
          length: Number(e.length ?? 0)
        }));
  const message: ChatMessage = {
    id: row.id,
    roomId: row.room_id,
    authorId: row.user_id,
    authorName: row.author_name ?? "",
    authorRole: role,
    avatarTone: (row.author_avatar_tone ?? "default") as ChatMessage["avatarTone"],
    initials: row.author_initials ?? "",
    body,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    isSystem: row.message_type === "system" || undefined,
    editedAt: row.edited_at
      ? row.edited_at instanceof Date
        ? row.edited_at.toISOString()
        : String(row.edited_at)
      : undefined,
    isDeleted: isDeleted || undefined,
    entities: entities && entities.length > 0 ? entities : undefined,
    aiGenerated: row.ai_generated || undefined,
    aiCommand: row.ai_command ?? undefined,
    sourceMessageIds: row.source_message_ids ?? undefined
  };
  if (!isDeleted && row.attachment_id && row.attachment_name) {
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
    m.edited_at, m.is_deleted, m.entities, m.ai_generated, m.ai_command,
    m.source_message_ids,
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
    // Phase 2 E-1 — include soft-deleted rows so the conversation flow
    // stays intact (tombstone). rowToMessage masks the body.
    const { rows } = await this.pool.query<MessageRow>(
      `${MESSAGE_SELECT} WHERE m.room_id = $1 ORDER BY m.created_at ASC`,
      [roomId]
    );
    return rows.map(rowToMessage);
  }

  async findById(messageId: string): Promise<ChatMessage | undefined> {
    const { rows } = await this.pool.query<MessageRow>(
      `${MESSAGE_SELECT} WHERE m.id = $1`,
      [messageId]
    );
    return rows[0] ? rowToMessage(rows[0]) : undefined;
  }

  async updateBody(messageId: string, body: string): Promise<ChatMessage | undefined> {
    // Refuse to edit an already-deleted row — undoing soft-delete is a
    // separate operation we don't currently expose.
    const { rowCount } = await this.pool.query(
      `UPDATE messages
          SET content = $1,
              edited_at = NOW(),
              updated_at = NOW()
        WHERE id = $2 AND NOT is_deleted`,
      [body, messageId]
    );
    if (!rowCount) return undefined;
    return this.findById(messageId);
  }

  async softDelete(messageId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE messages
          SET is_deleted = true,
              updated_at = NOW()
        WHERE id = $1 AND NOT is_deleted`,
      [messageId]
    );
    if (!rowCount) return false;
    // If this was the pinned message, drop the pin — a tombstone in the
    // pinned banner is worse than no banner.
    await this.pool.query(
      `UPDATE rooms SET pinned_message_id = NULL WHERE pinned_message_id = $1`,
      [messageId]
    );
    return true;
  }

  async search(opts: { q: string; roomIds: string[]; limit?: number }): Promise<ChatMessage[]> {
    const needle = opts.q.trim();
    if (!needle || opts.roomIds.length === 0) return [];
    const limit = Math.min(opts.limit ?? 50, 200);
    // ILIKE on content with a leading-wildcard pattern. Backed by the
    // pg_trgm GIN index from migration 011 so it stays sub-linear even
    // as the messages table grows. tsvector index isn't used yet — see
    // migration 011 for why we kept it for future use.
    const { rows } = await this.pool.query<MessageRow>(
      `${MESSAGE_SELECT}
       WHERE NOT m.is_deleted
         AND m.room_id = ANY($1::uuid[])
         AND m.content ILIKE '%' || $2 || '%'
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [opts.roomIds, needle, limit]
    );
    return rows.map(rowToMessage);
  }

  async append(
    roomId: string,
    message: ChatMessage,
    opts?: { attachmentId?: string }
  ): Promise<ChatMessage> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO messages
         (room_id, user_id, content, message_type, entities, ai_generated,
          ai_command, source_message_ids)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
       RETURNING id`,
      [
        roomId,
        message.authorId,
        message.body,
        message.isSystem ? "system" : "text",
        JSON.stringify(message.entities ?? []),
        message.aiGenerated ?? false,
        message.aiCommand ?? null,
        message.sourceMessageIds ?? null
      ]
    );
    const newId = rows[0].id;
    // Link the previously-uploaded attachment to this message. Restrict the
    // UPDATE to rows uploaded by the same user so a caller cannot reattach
    // someone else's file. Silent no-op when the id doesn't match — the
    // route layer surfaced ownership errors before reaching here.
    if (opts?.attachmentId) {
      await this.pool.query(
        `UPDATE attachments SET message_id = $1
          WHERE id = $2 AND uploaded_by = $3 AND message_id IS NULL`,
        [newId, opts.attachmentId, message.authorId]
      );
    }
    const { rows: persisted } = await this.pool.query<MessageRow>(
      `${MESSAGE_SELECT} WHERE m.id = $1`,
      [newId]
    );
    if (persisted.length === 0) {
      throw new Error("[postgres] failed to read back appended message");
    }
    return rowToMessage(persisted[0]);
  }

  async markRead(roomId: string, userId: string, lastMessageId: string): Promise<void> {
    // Phase 1 D-8 — UPDATE-only (no INSERT). The previous INSERT ON CONFLICT
    // implicitly granted membership to anyone who hit this endpoint, which
    // turned the read-marker into a privilege-escalation primitive. The HTTP
    // route now enforces membership via ensureRoomAccess before reaching
    // here, so non-members can no longer call this — but defense in depth:
    // even if the gate is bypassed, this query simply no-ops for non-members
    // since no row matches.
    await this.pool.query(
      `UPDATE room_members
          SET last_read_message_id = $3
        WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId, lastMessageId]
    );
  }

  async pin(
    roomId: string,
    messageId: string
  ): Promise<"ok" | "room_not_found" | "message_not_in_room"> {
    // Confirm the message belongs to the room before mutating rooms.
    const { rows: msgRows } = await this.pool.query<{ room_id: string }>(
      `SELECT room_id FROM messages WHERE id = $1`,
      [messageId]
    );
    if (msgRows.length === 0 || msgRows[0].room_id !== roomId) {
      return "message_not_in_room";
    }
    const { rowCount } = await this.pool.query(
      `UPDATE rooms SET pinned_message_id = $1 WHERE id = $2 AND is_active IS NOT FALSE`,
      [messageId, roomId]
    );
    if (!rowCount) return "room_not_found";
    return "ok";
  }

  async unpin(roomId: string): Promise<"ok" | "room_not_found"> {
    const { rowCount } = await this.pool.query(
      `UPDATE rooms SET pinned_message_id = NULL WHERE id = $1 AND is_active IS NOT FALSE`,
      [roomId]
    );
    if (!rowCount) return "room_not_found";
    return "ok";
  }

  async getPinned(roomId: string): Promise<PinnedMessageRef | undefined> {
    const { rows } = await this.pool.query<{
      id: string;
      content: string | null;
      created_at: Date;
      author_name: string | null;
    }>(
      `SELECT m.id, m.content, m.created_at, u.name AS author_name
         FROM rooms r
         JOIN messages m ON m.id = r.pinned_message_id
         JOIN users u ON u.id = m.user_id
        WHERE r.id = $1 AND NOT m.is_deleted`,
      [roomId]
    );
    if (rows.length === 0) return undefined;
    const r = rows[0];
    return {
      id: r.id,
      authorName: r.author_name ?? "",
      body: r.content ?? "",
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
    };
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

  async create(input: CreateProductInput): Promise<Product> {
    const featuresText = input.features?.join("\n") ?? null;
    const applicationsText = input.applications?.join("\n") ?? null;
    const cautionsText = input.cautions?.join("\n") ?? null;
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO products (
         name, category, description, features, application_area,
         caution, sales_status, sales_block_reason, owner_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.name,
        input.category ?? null,
        input.description ?? null,
        featuresText,
        applicationsText,
        cautionsText,
        // Same NOT NULL workaround as projects.sales_status. Default to
        // the enum value so reads round-trip cleanly.
        input.salesStatus ?? "preparing",
        input.salesNote ?? null,
        input.ownerId ?? null
      ]
    );
    const created = await this.findById(rows[0].id);
    if (!created) throw new Error("[postgres] failed to read back created product");
    return created;
  }

  async update(id: string, input: UpdateProductInput): Promise<Product | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.name !== undefined) add("name", input.name);
    if (input.category !== undefined) add("category", input.category);
    if (input.description !== undefined) add("description", input.description);
    if (input.features !== undefined) add("features", input.features.join("\n"));
    if (input.applications !== undefined)
      add("application_area", input.applications.join("\n"));
    if (input.cautions !== undefined) add("caution", input.cautions.join("\n"));
    if (input.salesStatus !== undefined) add("sales_status", input.salesStatus);
    if (input.salesNote !== undefined) add("sales_block_reason", input.salesNote);
    if (input.ownerId !== undefined) add("owner_id", input.ownerId);
    if (sets.length === 0) return this.findById(id);
    sets.push(`updated_at = NOW()`);
    params.push(id);
    const { rowCount } = await this.pool.query(
      `UPDATE products SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params
    );
    if (!rowCount) return undefined;
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM products WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  // ── Phase 7 J-1 — product_specs ───────────────────────────────────

  async listSpecs(productId: string): Promise<ProductSpec[]> {
    const { rows } = await this.pool.query<{
      id: string;
      product_id: string;
      key: string;
      value: string;
      sort_order: number;
    }>(
      `SELECT id, product_id, key, value, sort_order
         FROM product_specs
        WHERE product_id = $1
        ORDER BY sort_order ASC, key ASC`,
      [productId]
    );
    return rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      key: r.key,
      value: r.value,
      sortOrder: r.sort_order
    }));
  }

  async createSpec(productId: string, input: CreateProductSpecInput): Promise<ProductSpec> {
    // (product_id, key) UNIQUE — 동일 key면 value 갱신.
    const { rows } = await this.pool.query<{
      id: string;
      product_id: string;
      key: string;
      value: string;
      sort_order: number;
    }>(
      `INSERT INTO product_specs (product_id, key, value, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, key)
       DO UPDATE SET value = EXCLUDED.value,
                     sort_order = EXCLUDED.sort_order,
                     updated_at = NOW()
       RETURNING id, product_id, key, value, sort_order`,
      [productId, input.key, input.value, input.sortOrder ?? 0]
    );
    const r = rows[0];
    return { id: r.id, productId: r.product_id, key: r.key, value: r.value, sortOrder: r.sort_order };
  }

  async updateSpec(
    productId: string,
    specId: string,
    input: UpdateProductSpecInput
  ): Promise<ProductSpec | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.key !== undefined) {
      params.push(input.key);
      sets.push(`key = $${params.length}`);
    }
    if (input.value !== undefined) {
      params.push(input.value);
      sets.push(`value = $${params.length}`);
    }
    if (input.sortOrder !== undefined) {
      params.push(input.sortOrder);
      sets.push(`sort_order = $${params.length}`);
    }
    if (sets.length === 0) {
      const cur = await this.pool.query<{
        id: string;
        product_id: string;
        key: string;
        value: string;
        sort_order: number;
      }>(
        `SELECT id, product_id, key, value, sort_order FROM product_specs WHERE id = $1 AND product_id = $2`,
        [specId, productId]
      );
      const r = cur.rows[0];
      return r ? { id: r.id, productId: r.product_id, key: r.key, value: r.value, sortOrder: r.sort_order } : undefined;
    }
    sets.push(`updated_at = NOW()`);
    params.push(specId, productId);
    const { rows } = await this.pool.query<{
      id: string;
      product_id: string;
      key: string;
      value: string;
      sort_order: number;
    }>(
      `UPDATE product_specs SET ${sets.join(", ")}
        WHERE id = $${params.length - 1} AND product_id = $${params.length}
       RETURNING id, product_id, key, value, sort_order`,
      params
    );
    const r = rows[0];
    return r ? { id: r.id, productId: r.product_id, key: r.key, value: r.value, sortOrder: r.sort_order } : undefined;
  }

  async deleteSpec(productId: string, specId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM product_specs WHERE id = $1 AND product_id = $2`,
      [specId, productId]
    );
    return (rowCount ?? 0) > 0;
  }

  // ── Phase 7 J-1 — product_lots ───────────────────────────────────

  async listLots(productId: string): Promise<ProductLot[]> {
    const { rows } = await this.pool.query<LotRow>(
      `${LOT_SELECT} WHERE product_id = $1 ORDER BY produced_at DESC NULLS LAST, created_at DESC`,
      [productId]
    );
    return rows.map(rowToLot);
  }

  async createLot(productId: string, input: CreateProductLotInput): Promise<ProductLot> {
    const { rows } = await this.pool.query<LotRow>(
      `INSERT INTO product_lots
         (product_id, lot_no, produced_at, quantity_kg, verdict, tested_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, product_id, lot_no, produced_at, quantity_kg,
                 verdict, tested_at, notes, created_at`,
      [
        productId,
        input.number,
        input.producedAt || null,
        input.quantity ?? null,
        input.verdict ?? null,
        input.testedAt || null,
        input.note ?? null
      ]
    );
    return rowToLot(rows[0]);
  }

  async updateLot(
    productId: string,
    lotId: string,
    input: UpdateProductLotInput
  ): Promise<ProductLot | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.number !== undefined) add("lot_no", input.number);
    if (input.producedAt !== undefined) add("produced_at", input.producedAt || null);
    if (input.quantity !== undefined) add("quantity_kg", input.quantity ?? null);
    if (input.verdict !== undefined) add("verdict", input.verdict ?? null);
    if (input.testedAt !== undefined) add("tested_at", input.testedAt || null);
    if (input.note !== undefined) add("notes", input.note ?? null);
    if (sets.length === 0) {
      const cur = await this.pool.query<LotRow>(
        `${LOT_SELECT} WHERE id = $1 AND product_id = $2`,
        [lotId, productId]
      );
      return cur.rows[0] ? rowToLot(cur.rows[0]) : undefined;
    }
    sets.push("updated_at = NOW()");
    params.push(lotId, productId);
    const { rows } = await this.pool.query<LotRow>(
      `UPDATE product_lots SET ${sets.join(", ")}
        WHERE id = $${params.length - 1} AND product_id = $${params.length}
       RETURNING id, product_id, lot_no, produced_at, quantity_kg,
                 verdict, tested_at, notes, created_at`,
      params
    );
    return rows[0] ? rowToLot(rows[0]) : undefined;
  }

  async deleteLot(productId: string, lotId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM product_lots WHERE id = $1 AND product_id = $2`,
      [lotId, productId]
    );
    return (rowCount ?? 0) > 0;
  }

  // ── Phase 7 J-1 — sales_status_events ─────────────────────────────

  async listSalesEvents(productId: string): Promise<SalesStatusEvent[]> {
    const { rows } = await this.pool.query<SalesEventRow>(
      `SELECT e.id, e.product_id, e.from_status, e.to_status, e.reason,
              e.changed_by, e.changed_at, u.name AS changed_by_name
         FROM sales_status_events e
         LEFT JOIN users u ON u.id = e.changed_by
        WHERE e.product_id = $1
        ORDER BY e.changed_at DESC`,
      [productId]
    );
    return rows.map(rowToSalesEvent);
  }

  async appendSalesEvent(input: {
    productId: string;
    fromStatus?: string;
    toStatus: string;
    reason?: string;
    changedBy: { id: string };
  }): Promise<SalesStatusEvent> {
    const { rows } = await this.pool.query<SalesEventRow>(
      `INSERT INTO sales_status_events
         (product_id, from_status, to_status, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, product_id, from_status, to_status, reason,
                 changed_by, changed_at,
                 (SELECT name FROM users WHERE id = $5) AS changed_by_name`,
      [
        input.productId,
        input.fromStatus ?? null,
        input.toStatus,
        input.reason ?? null,
        input.changedBy.id
      ]
    );
    return rowToSalesEvent(rows[0]);
  }

  // ── Phase 7 J-2 — product_documents ───────────────────────────────

  private async readDocument(docId: string): Promise<ProductDocument | undefined> {
    const { rows } = await this.pool.query<ProductDocRow>(
      `${PRODUCT_DOC_SELECT} WHERE pd.id = $1`,
      [docId]
    );
    return rows[0] ? rowToProductDoc(rows[0]) : undefined;
  }

  async listDocuments(productId: string, type?: string): Promise<ProductDocument[]> {
    const params: unknown[] = [productId];
    let where = `WHERE pd.product_id = $1`;
    if (type) {
      params.push(type);
      where += ` AND pd.document_type = $2`;
    }
    const { rows } = await this.pool.query<ProductDocRow>(
      `${PRODUCT_DOC_SELECT} ${where} ORDER BY pd.created_at DESC`,
      params
    );
    return rows.map(rowToProductDoc);
  }

  async createDocument(
    productId: string,
    attachmentId: string,
    documentType: ProductDocumentType
  ): Promise<ProductDocument | undefined> {
    // INSERT only when the attachment exists — guards the FK and lets the
    // route return a clean 404 instead of a 500 on a bad attachment id.
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO product_documents (product_id, attachment_id, document_type)
       SELECT $1, $2, $3
        WHERE EXISTS (SELECT 1 FROM attachments WHERE id = $2)
       RETURNING id`,
      [productId, attachmentId, documentType]
    );
    if (rows.length === 0) return undefined;
    return this.readDocument(rows[0].id);
  }

  async deleteDocument(
    productId: string,
    docId: string
  ): Promise<{ attachmentId: string } | undefined> {
    const { rows } = await this.pool.query<{ attachment_id: string }>(
      `DELETE FROM product_documents
        WHERE id = $1 AND product_id = $2
       RETURNING attachment_id`,
      [docId, productId]
    );
    return rows[0] ? { attachmentId: rows[0].attachment_id } : undefined;
  }
}

interface ProductDocRow {
  id: string;
  product_id: string;
  attachment_id: string;
  document_type: string;
  created_at: Date | string;
  file_name: string;
  file_type: string | null;
  file_size: string | number | null;
  uploaded_by: string;
  uploaded_by_name: string | null;
}

const PRODUCT_DOC_SELECT = `
  SELECT pd.id, pd.product_id, pd.attachment_id, pd.document_type, pd.created_at,
         a.file_name, a.file_type, a.file_size, a.uploaded_by,
         u.name AS uploaded_by_name
    FROM product_documents pd
    JOIN attachments a ON a.id = pd.attachment_id
    LEFT JOIN users u ON u.id = a.uploaded_by
`;

function rowToProductDoc(row: ProductDocRow): ProductDocument {
  return {
    id: row.id,
    productId: row.product_id,
    attachmentId: row.attachment_id,
    documentType: row.document_type as ProductDocumentType,
    fileName: row.file_name,
    fileKind: deriveFileKind(row.file_name, row.file_type),
    sizeLabel: row.file_size != null ? formatBytes(Number(row.file_size)) : "",
    uploadedById: row.uploaded_by,
    uploadedByName: row.uploaded_by_name ?? undefined,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
}

interface LotRow {
  id: string;
  product_id: string;
  lot_no: string;
  produced_at: Date | null;
  quantity_kg: string | number | null;
  verdict: string | null;
  tested_at: Date | null;
  notes: string | null;
  created_at: Date;
}

const LOT_SELECT = `
  SELECT id, product_id, lot_no, produced_at, quantity_kg,
         verdict, tested_at, notes, created_at
    FROM product_lots
`;

function rowToLot(row: LotRow): ProductLot {
  return {
    id: row.id,
    productId: row.product_id,
    number: row.lot_no,
    producedAt: row.produced_at ? formatDate(row.produced_at) : undefined,
    quantity: row.quantity_kg != null ? String(row.quantity_kg) : undefined,
    verdict: (row.verdict as ProductLot["verdict"]) ?? undefined,
    testedAt: row.tested_at ? formatDate(row.tested_at) : undefined,
    note: row.notes ?? undefined,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
}

interface SalesEventRow {
  id: string;
  product_id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  changed_by: string;
  changed_at: Date;
  changed_by_name: string | null;
}

function rowToSalesEvent(row: SalesEventRow): SalesStatusEvent {
  return {
    id: row.id,
    productId: row.product_id,
    fromStatus: (row.from_status as SalesStatus | null) ?? undefined,
    toStatus: row.to_status as SalesStatus,
    reason: row.reason ?? undefined,
    changedById: row.changed_by,
    changedByName: row.changed_by_name ?? "",
    changedAt:
      row.changed_at instanceof Date ? row.changed_at.toISOString() : String(row.changed_at)
  };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

interface AttachmentRow {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size: string | number | null;
  file_url: string;
  uploaded_by: string;
  project_id: string | null;
  product_id: string | null;
  task_id: string | null;
  message_id: string | null;
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
    uploadedAt: row.created_at instanceof Date
      ? formatDate(row.created_at)
      : String(row.created_at),
    projectId: row.project_id ?? undefined,
    productId: row.product_id ?? undefined,
    taskId: row.task_id ?? undefined,
    messageId: row.message_id ?? undefined
  };
}

const ATTACHMENT_SELECT = `
  SELECT id, file_name, file_type, file_size, file_url, uploaded_by,
         project_id, product_id, task_id, message_id, created_at
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

  async listFiles(filter?: ListFilesFilter): Promise<FileEntry[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: string | undefined) => {
      if (val == null) return;
      params.push(val);
      where.push(`${col} = $${params.length}`);
    };
    add("project_id", filter?.projectId);
    add("product_id", filter?.productId);
    add("task_id", filter?.taskId);
    add("message_id", filter?.messageId);
    add("uploaded_by", filter?.uploaderId);
    const sql = `${ATTACHMENT_SELECT}${
      where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""
    } ORDER BY created_at DESC`;
    const { rows } = await this.pool.query<AttachmentRow>(sql, params);
    return rows.map(rowToFile);
  }

  async create(input: CreateFileInput, uploaderId: string): Promise<FileEntry> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO attachments (
         file_name, file_type, file_size, file_url, uploaded_by,
         project_id, product_id, task_id, message_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.fileName,
        input.fileType ?? null,
        input.fileSize,
        input.fileUrl,
        uploaderId,
        input.projectId ?? null,
        input.productId ?? null,
        input.taskId ?? null,
        input.messageId ?? null
      ]
    );
    const created = await this.findById(rows[0].id);
    if (!created) throw new Error("[postgres] failed to read back created attachment");
    return created;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM attachments WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  async findById(id: string): Promise<FileEntry | undefined> {
    const { rows } = await this.pool.query<AttachmentRow>(
      `${ATTACHMENT_SELECT} WHERE id = $1`,
      [id]
    );
    return rows[0] ? rowToFile(rows[0]) : undefined;
  }

  async findStorage(
    id: string
  ): Promise<{ fileName: string; fileUrl: string; fileType?: string } | undefined> {
    const { rows } = await this.pool.query<{
      file_name: string;
      file_url: string;
      file_type: string | null;
    }>(
      `SELECT file_name, file_url, file_type FROM attachments WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return undefined;
    return {
      fileName: rows[0].file_name,
      fileUrl: rows[0].file_url,
      fileType: rows[0].file_type ?? undefined
    };
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

  async create(
    input: CreateNoticeInput,
    author: { id: string; departmentName: string }
  ): Promise<Notice> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO notices (title, content, is_required, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.title, input.body, input.isMandatory ?? true, author.id]
    );
    const created = await this.findById(rows[0].id);
    if (!created) throw new Error("[postgres] failed to read back created notice");
    return created;
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

  async getReadStatus(id: string): Promise<NoticeReadStatus | undefined> {
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM notices WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) return undefined;
    // One row per active user. LEFT JOIN against notice_reads so users who
    // haven't confirmed still appear (with NULL confirmed_at).
    const { rows } = await this.pool.query<{
      user_id: string;
      name: string;
      department_name: string | null;
      confirmed_at: Date | null;
    }>(
      `SELECT u.id AS user_id, u.name, d.name AS department_name,
              nr.confirmed_at
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN notice_reads nr
           ON nr.notice_id = $1 AND nr.user_id = u.id
        WHERE u.is_active IS NOT FALSE
        ORDER BY u.name`,
      [id]
    );
    const confirmed: NoticeReadStatusEntry[] = [];
    const unconfirmed: NoticeReadStatusEntry[] = [];
    for (const r of rows) {
      const base = {
        userId: r.user_id,
        name: r.name,
        departmentName: r.department_name ?? ""
      };
      if (r.confirmed_at) {
        confirmed.push({ ...base, confirmedAt: r.confirmed_at.toISOString() });
      } else {
        unconfirmed.push(base);
      }
    }
    return {
      noticeId: id,
      totalRecipients: rows.length,
      confirmed,
      unconfirmed
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

class PgAuditRepository implements AuditRepository {
  constructor(private readonly pool: Pool) {}

  async record(input: CreateAuditInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs
         (actor_user_id, actor_name, actor_role, action, target_type,
          target_id, target_label, ip, level, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.actorUserId ?? null,
        input.actorName ?? null,
        input.actorRole ?? null,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.targetLabel ?? null,
        input.ip ?? null,
        input.level ?? "info",
        input.meta ? JSON.stringify(input.meta) : null
      ]
    );
  }

  async list(opts?: { limit?: number; action?: string; actorUserId?: string }): Promise<AuditEntry[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.action) {
      params.push(opts.action);
      where.push(`action = $${params.length}`);
    }
    if (opts?.actorUserId) {
      params.push(opts.actorUserId);
      where.push(`actor_user_id = $${params.length}`);
    }
    const limit = Math.min(opts?.limit ?? 50, 200);
    params.push(limit);
    const sql = `
      SELECT id, actor_name, action, target_type, target_id, target_label,
             level, created_at
        FROM audit_logs
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT $${params.length}
    `;
    const { rows } = await this.pool.query<{
      id: string;
      actor_name: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      target_label: string | null;
      level: string | null;
      created_at: Date;
    }>(sql, params);
    return rows.map((r) => ({
      id: r.id,
      title: `${r.actor_name ?? "시스템"} · ${r.action}`,
      meta: r.target_label ?? r.target_id ?? r.target_type ?? "",
      time: relativeTimePg(r.created_at),
      level: (r.level ?? "info") as AuditEntry["level"]
    }));
  }

  // Phase 8 K-5 — paginated + filtered search for /admin/audit.
  async search(query: AuditLogQuery): Promise<AuditLogPage> {
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const conds: string[] = [];
    const params: unknown[] = [];
    if (query.action) {
      params.push(query.action);
      conds.push(`action = $${params.length}`);
    }
    if (query.actor) {
      params.push(`%${query.actor}%`);
      conds.push(`actor_name ILIKE $${params.length}`);
    }
    if (query.after) {
      params.push(query.after);
      conds.push(`created_at >= $${params.length}::date`);
    }
    if (query.before) {
      params.push(query.before);
      conds.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    const countRes = await this.pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM audit_logs ${where}`,
      params
    );
    const total = countRes.rows[0]?.n ?? 0;

    const listParams = params.slice();
    listParams.push(limit);
    const limIdx = listParams.length;
    listParams.push(offset);
    const offIdx = listParams.length;
    const { rows } = await this.pool.query<{
      id: string;
      action: string;
      actor_name: string | null;
      actor_role: string | null;
      target_type: string | null;
      target_label: string | null;
      ip: string | null;
      level: string | null;
      created_at: Date | string;
    }>(
      `SELECT id, action, actor_name, actor_role, target_type, target_label,
              ip, level, created_at
         FROM audit_logs
        ${where}
        ORDER BY created_at DESC
        LIMIT $${limIdx} OFFSET $${offIdx}`,
      listParams
    );

    const actionsRes = await this.pool.query<{ action: string }>(
      `SELECT DISTINCT action FROM audit_logs ORDER BY action`
    );

    return {
      rows: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorName: r.actor_name ?? "시스템",
        actorRole: r.actor_role ?? undefined,
        targetType: r.target_type ?? undefined,
        targetLabel: r.target_label ?? undefined,
        level: (r.level ?? "info") as AuditLogRow["level"],
        ip: r.ip ?? undefined,
        createdAt:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at)
      })),
      total,
      actions: actionsRes.rows.map((r) => r.action)
    };
  }
}

function relativeTimePg(d: Date): string {
  const t = d instanceof Date ? d.getTime() : Date.parse(String(d));
  if (Number.isNaN(t)) return String(d);
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const dt = new Date(t);
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Decisions (Phase 3 F-1)
// ---------------------------------------------------------------------------

interface DecisionRow {
  id: string;
  project_id: string;
  title: string;
  content: string;
  decided_by: string;
  decision_date: Date | string;
  related_message_id: string | null;
  related_room_id: string | null;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
  decided_by_name: string | null;
  decided_by_position: string | null;
  decided_by_department: string | null;
  total_recipients: string | number | null;
  confirmed_count: string | number | null;
  my_confirmed: boolean | null;
}

function rowToDecision(row: DecisionRow): Decision {
  const deleted = Boolean(row.is_deleted);
  const role =
    row.decided_by_position && row.decided_by_department
      ? `${row.decided_by_position} · ${row.decided_by_department}`
      : row.decided_by_position ?? undefined;
  return {
    id: row.id,
    projectId: row.project_id,
    title: deleted ? "삭제된 결정사항입니다" : row.title,
    content: deleted ? "삭제된 결정사항입니다" : row.content,
    decidedById: row.decided_by,
    decidedByName: row.decided_by_name ?? "",
    decidedByRole: role,
    decisionDate: formatDate(row.decision_date),
    sourceMessageId: row.related_message_id ?? undefined,
    sourceRoomId: row.related_room_id ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    totalRecipients: Number(row.total_recipients) || 0,
    confirmedCount: Number(row.confirmed_count) || 0,
    myConfirmed: Boolean(row.my_confirmed),
    isDeleted: deleted || undefined
  };
}

// $1 is the caller's user_id (nullable) and is reused for my_confirmed.
const DECISION_SELECT = `
  SELECT
    d.id, d.project_id, d.title, d.content, d.decided_by, d.decision_date,
    d.related_message_id, d.created_at, d.updated_at, d.is_deleted,
    u.name AS decided_by_name,
    u.position AS decided_by_position,
    dep.name AS decided_by_department,
    -- The source message lives in some room; surface it so the UI can deep
    -- link without an extra round trip.
    (SELECT m.room_id FROM messages m WHERE m.id = d.related_message_id) AS related_room_id,
    COALESCE((SELECT COUNT(*) FROM users uu WHERE uu.is_active), 0) AS total_recipients,
    COALESCE((SELECT COUNT(*) FROM decision_reads dr WHERE dr.decision_id = d.id), 0)
      AS confirmed_count,
    EXISTS (
      SELECT 1 FROM decision_reads dr
      WHERE dr.decision_id = d.id AND dr.user_id = $1::uuid
    ) AS my_confirmed
  FROM decisions d
  LEFT JOIN users u ON u.id = d.decided_by
  LEFT JOIN departments dep ON dep.id = u.department_id
`;

class PgDecisionRepository implements DecisionRepository {
  constructor(private readonly pool: Pool) {}

  async listByProject(projectId: string, userId?: string): Promise<Decision[]> {
    const { rows } = await this.pool.query<DecisionRow>(
      `${DECISION_SELECT}
       WHERE d.project_id = $2
       ORDER BY d.decision_date DESC, d.created_at DESC`,
      [userId ?? null, projectId]
    );
    return rows.map(rowToDecision);
  }

  async findById(id: string, userId?: string): Promise<Decision | undefined> {
    const { rows } = await this.pool.query<DecisionRow>(
      `${DECISION_SELECT} WHERE d.id = $2`,
      [userId ?? null, id]
    );
    return rows[0] ? rowToDecision(rows[0]) : undefined;
  }

  async create(
    projectId: string,
    input: CreateDecisionInput,
    decidedBy: { id: string }
  ): Promise<Decision> {
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO decisions
         (project_id, title, content, decided_by, decision_date, related_message_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        projectId,
        input.title,
        input.content,
        decidedBy.id,
        input.decisionDate ?? today,
        input.sourceMessageId ?? null
      ]
    );
    const created = await this.findById(rows[0].id, decidedBy.id);
    if (!created) throw new Error("[postgres] failed to read back created decision");
    return created;
  }

  async update(id: string, input: UpdateDecisionInput): Promise<Decision | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.title !== undefined) add("title", input.title);
    if (input.content !== undefined) add("content", input.content);
    if (input.decisionDate !== undefined) add("decision_date", input.decisionDate);
    if (sets.length === 0) return this.findById(id);
    sets.push("updated_at = NOW()");
    params.push(id);
    const { rowCount } = await this.pool.query(
      `UPDATE decisions SET ${sets.join(", ")}
        WHERE id = $${params.length} AND NOT is_deleted`,
      params
    );
    if (!rowCount) return undefined;
    return this.findById(id);
  }

  async softDelete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE decisions SET is_deleted = true, updated_at = NOW()
        WHERE id = $1 AND NOT is_deleted`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  async markConfirmed(id: string, userId: string): Promise<Decision | undefined> {
    const exists = await this.pool.query<{ id: string }>(
      `SELECT id FROM decisions WHERE id = $1 AND NOT is_deleted`,
      [id]
    );
    if (exists.rows.length === 0) return undefined;
    await this.pool.query(
      `INSERT INTO decision_reads (decision_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (decision_id, user_id) DO NOTHING`,
      [id, userId]
    );
    return this.findById(id, userId);
  }

  async getReadStatus(id: string): Promise<DecisionReadStatus | undefined> {
    const exists = await this.pool.query<{ id: string }>(
      `SELECT id FROM decisions WHERE id = $1`,
      [id]
    );
    if (exists.rows.length === 0) return undefined;
    const { rows } = await this.pool.query<{
      user_id: string;
      name: string;
      department_name: string | null;
      confirmed_at: Date | null;
    }>(
      `SELECT u.id AS user_id, u.name, d.name AS department_name,
              dr.confirmed_at
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN decision_reads dr
           ON dr.decision_id = $1 AND dr.user_id = u.id
        WHERE u.is_active IS NOT FALSE
        ORDER BY u.name`,
      [id]
    );
    const confirmed: DecisionReadStatusEntry[] = [];
    const unconfirmed: DecisionReadStatusEntry[] = [];
    for (const r of rows) {
      const base = {
        userId: r.user_id,
        name: r.name,
        departmentName: r.department_name ?? ""
      };
      if (r.confirmed_at) {
        confirmed.push({ ...base, confirmedAt: r.confirmed_at.toISOString() });
      } else {
        unconfirmed.push(base);
      }
    }
    return {
      decisionId: id,
      totalRecipients: rows.length,
      confirmed,
      unconfirmed
    };
  }
}

// ---------------------------------------------------------------------------
// Notifications (Phase 6 I-1)
// ---------------------------------------------------------------------------

interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  payload: unknown;
  read_at: Date | null;
  created_at: Date;
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    title: row.title,
    body: row.body ?? undefined,
    link: row.link ?? undefined,
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : undefined,
    readAt: row.read_at instanceof Date ? row.read_at.toISOString() : undefined,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
}

interface SettingsRow {
  user_id: string;
  all_enabled: boolean;
  per_room: unknown;
  per_project: unknown;
  web_push_enabled: boolean;
  browser_enabled: boolean;
}

function rowToSettings(row: SettingsRow): NotificationSettings {
  return {
    userId: row.user_id,
    allEnabled: row.all_enabled,
    perRoom:
      row.per_room && typeof row.per_room === "object"
        ? (row.per_room as Record<string, boolean>)
        : {},
    perProject:
      row.per_project && typeof row.per_project === "object"
        ? (row.per_project as Record<string, boolean>)
        : {},
    webPushEnabled: row.web_push_enabled,
    browserEnabled: row.browser_enabled
  };
}

class PgNotificationRepository implements NotificationRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const { rows } = await this.pool.query<NotificationRow>(
      `INSERT INTO user_notifications
         (user_id, kind, title, body, link, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, user_id, kind, title, body, link, payload, read_at, created_at`,
      [
        input.userId,
        input.kind,
        input.title,
        input.body ?? null,
        input.link ?? null,
        input.payload ? JSON.stringify(input.payload) : null
      ]
    );
    return rowToNotification(rows[0]);
  }

  async createMany(
    userIds: string[],
    input: Omit<CreateNotificationInput, "userId">
  ): Promise<Notification[]> {
    if (userIds.length === 0) return [];
    // Single VALUES batch insert. Build placeholders dynamically because
    // we don't know N at compile time.
    const params: unknown[] = [
      input.kind,
      input.title,
      input.body ?? null,
      input.link ?? null,
      input.payload ? JSON.stringify(input.payload) : null
    ];
    const values = userIds
      .map((uid) => {
        params.push(uid);
        return `($${params.length}, $1, $2, $3, $4, $5::jsonb)`;
      })
      .join(", ");
    const { rows } = await this.pool.query<NotificationRow>(
      `INSERT INTO user_notifications
         (user_id, kind, title, body, link, payload)
       VALUES ${values}
       RETURNING id, user_id, kind, title, body, link, payload, read_at, created_at`,
      params
    );
    return rows.map(rowToNotification);
  }

  async listForUser(
    userId: string,
    opts?: { unreadOnly?: boolean; limit?: number }
  ): Promise<Notification[]> {
    const limit = Math.min(opts?.limit ?? 20, 100);
    const filter = opts?.unreadOnly ? "AND read_at IS NULL" : "";
    const { rows } = await this.pool.query<NotificationRow>(
      `SELECT id, user_id, kind, title, body, link, payload, read_at, created_at
         FROM user_notifications
        WHERE user_id = $1 ${filter}
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit]
    );
    return rows.map(rowToNotification);
  }

  async unreadCount(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM user_notifications
        WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return Number(rows[0]?.c ?? 0);
  }

  async markRead(id: string, userId: string): Promise<Notification | undefined> {
    const { rows } = await this.pool.query<NotificationRow>(
      `UPDATE user_notifications
          SET read_at = COALESCE(read_at, NOW())
        WHERE id = $1 AND user_id = $2
        RETURNING id, user_id, kind, title, body, link, payload, read_at, created_at`,
      [id, userId]
    );
    return rows[0] ? rowToNotification(rows[0]) : undefined;
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const { rowCount } = await this.pool.query(
      `UPDATE user_notifications
          SET read_at = NOW()
        WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return { count: rowCount ?? 0 };
  }

  async getSettings(userId: string): Promise<NotificationSettings> {
    // Lazy create on first access.
    await this.pool.query(
      `INSERT INTO user_notification_settings (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const { rows } = await this.pool.query<SettingsRow>(
      `SELECT user_id, all_enabled, per_room, per_project,
              web_push_enabled, browser_enabled
         FROM user_notification_settings
        WHERE user_id = $1`,
      [userId]
    );
    return rowToSettings(rows[0]);
  }

  async updateSettings(
    userId: string,
    input: UpdateNotificationSettingsInput
  ): Promise<NotificationSettings> {
    // Ensure the row exists.
    await this.getSettings(userId);
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.allEnabled !== undefined) add("all_enabled", input.allEnabled);
    if (input.perRoom !== undefined) add("per_room", JSON.stringify(input.perRoom));
    if (input.perProject !== undefined) add("per_project", JSON.stringify(input.perProject));
    if (input.webPushEnabled !== undefined) add("web_push_enabled", input.webPushEnabled);
    if (input.browserEnabled !== undefined) add("browser_enabled", input.browserEnabled);
    if (sets.length === 0) return this.getSettings(userId);
    sets.push("updated_at = NOW()");
    params.push(userId);
    await this.pool.query(
      `UPDATE user_notification_settings SET ${sets.join(", ")} WHERE user_id = $${params.length}`,
      params
    );
    return this.getSettings(userId);
  }
}

// Phase 6 I-5 — push_subscriptions.
class PgPushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(input: CreatePushSubscriptionInput): Promise<PushSubscriptionRecord> {
    const { rows } = await this.pool.query<{
      id: string;
      user_id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      user_agent: string | null;
      created_at: Date;
    }>(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, endpoint)
       DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
                     user_agent = EXCLUDED.user_agent
       RETURNING id, user_id, endpoint, p256dh, auth, user_agent, created_at`,
      [input.userId, input.endpoint, input.p256dh, input.auth, input.userAgent ?? null]
    );
    const r = rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      endpoint: r.endpoint,
      p256dh: r.p256dh,
      auth: r.auth,
      userAgent: r.user_agent ?? undefined,
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
    };
  }

  async listForUser(userId: string): Promise<PushSubscriptionRecord[]> {
    const { rows } = await this.pool.query<{
      id: string;
      user_id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      user_agent: string | null;
      created_at: Date;
    }>(
      `SELECT id, user_id, endpoint, p256dh, auth, user_agent, created_at
         FROM push_subscriptions
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      endpoint: r.endpoint,
      p256dh: r.p256dh,
      auth: r.auth,
      userAgent: r.user_agent ?? undefined,
      createdAt: r.created_at.toISOString()
    }));
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM push_subscriptions WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  async deleteByEndpoint(userId: string, endpoint: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
      [userId, endpoint]
    );
    return (rowCount ?? 0) > 0;
  }
}

class PgRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly pool: Pool) {}

  async issue(
    userId: string,
    ctx?: { userAgent?: string; ip?: string }
  ): Promise<IssuedRefreshToken> {
    const raw = randomBytes(32).toString("hex");
    const tokenHash = hashRefreshToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, tokenHash, expiresAt, ctx?.userAgent ?? null, ctx?.ip ?? null]
    );
    return { token: raw, tokenId: rows[0].id, expiresAt };
  }

  async resolve(rawToken: string): Promise<ResolvedRefreshToken | undefined> {
    if (!rawToken) return undefined;
    const hash = hashRefreshToken(rawToken);
    const { rows } = await this.pool.query<{
      id: string;
      user_id: string;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, revoked_at
         FROM refresh_tokens
        WHERE token_hash = $1`,
      [hash]
    );
    const row = rows[0];
    if (!row) return undefined;
    if (row.revoked_at) return undefined;
    if (new Date(row.expires_at).getTime() <= Date.now()) return undefined;
    return { tokenId: row.id, userId: row.user_id, expiresAt: new Date(row.expires_at) };
  }

  async revoke(tokenId: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
        WHERE id = $1 AND revoked_at IS NULL`,
      [tokenId]
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  }
}

// Phase 8 K-2 — 사용자 초대.
interface InvitationRow {
  id: string;
  email: string;
  role: string;
  department_id: string | null;
  department_name: string | null;
  token: string;
  invited_by: string;
  invited_by_name: string | null;
  accepted_at: Date | string | null;
  expires_at: Date | string;
  created_at: Date | string;
}

const INVITATION_SELECT = `
  SELECT i.id, i.email, i.role, i.department_id, i.token, i.invited_by,
         i.accepted_at, i.expires_at, i.created_at,
         d.name AS department_name, u.name AS invited_by_name
    FROM user_invitations i
    LEFT JOIN departments d ON d.id = i.department_id
    LEFT JOIN users u ON u.id = i.invited_by
`;

function rowToInvitation(row: InvitationRow): UserInvitation {
  const iso = (v: Date | string) =>
    v instanceof Date ? v.toISOString() : String(v);
  const accepted = row.accepted_at ? iso(row.accepted_at) : undefined;
  const expiresAt = iso(row.expires_at);
  const status: UserInvitation["status"] = accepted
    ? "accepted"
    : Date.parse(expiresAt) <= Date.now()
    ? "expired"
    : "pending";
  return {
    id: row.id,
    email: row.email,
    role: row.role as UserInvitation["role"],
    departmentId: row.department_id ?? undefined,
    departmentName: row.department_name ?? undefined,
    token: row.token,
    invitedById: row.invited_by,
    invitedByName: row.invited_by_name ?? undefined,
    status,
    acceptedAt: accepted,
    expiresAt,
    createdAt: iso(row.created_at)
  };
}

class PgInvitationRepository implements InvitationRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<UserInvitation[]> {
    const { rows } = await this.pool.query<InvitationRow>(
      `${INVITATION_SELECT} ORDER BY i.created_at DESC`
    );
    return rows.map(rowToInvitation);
  }

  async findByToken(token: string): Promise<UserInvitation | undefined> {
    const { rows } = await this.pool.query<InvitationRow>(
      `${INVITATION_SELECT} WHERE i.token = $1`,
      [token]
    );
    return rows[0] ? rowToInvitation(rows[0]) : undefined;
  }

  async create(input: {
    email: string;
    role: string;
    departmentId: string;
    token: string;
    expiresAt: string;
    invitedBy: { id: string };
  }): Promise<UserInvitation> {
    await this.pool.query(
      `INSERT INTO user_invitations
         (email, role, department_id, token, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.email,
        input.role,
        input.departmentId,
        input.token,
        input.invitedBy.id,
        input.expiresAt
      ]
    );
    const created = await this.findByToken(input.token);
    if (!created) throw new Error("[postgres] failed to read back invitation");
    return created;
  }

  async markAccepted(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE user_invitations SET accepted_at = NOW()
        WHERE id = $1 AND accepted_at IS NULL`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM user_invitations WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }
}

// Phase 8 K-4 — 전사 기본 알림 정책.
class PgOrgNotificationRepository implements OrgNotificationRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<OrgNotificationDefault[]> {
    const { rows } = await this.pool.query<{
      category: string;
      enabled: boolean;
      updated_at: Date | string | null;
      updated_by_name: string | null;
    }>(
      `SELECT d.category, d.enabled, d.updated_at, u.name AS updated_by_name
         FROM org_notification_defaults d
         LEFT JOIN users u ON u.id = d.updated_by`
    );
    const byCat = new Map(rows.map((r) => [r.category, r]));
    return NOTIFICATION_CATEGORIES.map((category) => {
      const r = byCat.get(category);
      return {
        category,
        enabled: r ? r.enabled : true,
        updatedAt:
          r?.updated_at != null
            ? r.updated_at instanceof Date
              ? r.updated_at.toISOString()
              : String(r.updated_at)
            : undefined,
        updatedByName: r?.updated_by_name ?? undefined
      };
    });
  }

  async isCategoryEnabled(category: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ enabled: boolean }>(
      `SELECT enabled FROM org_notification_defaults WHERE category = $1`,
      [category]
    );
    return rows[0] ? rows[0].enabled : true;
  }

  async setEnabled(
    category: string,
    enabled: boolean,
    updatedBy: string
  ): Promise<OrgNotificationDefault> {
    await this.pool.query(
      `INSERT INTO org_notification_defaults (category, enabled, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (category)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()`,
      [category, enabled, updatedBy]
    );
    const all = await this.list();
    return all.find((d) => d.category === category)!;
  }
}

export function createPostgresRepositories(pool: Pool): Repositories {
  const users = new PgUserRepository(pool);
  return {
    users,
    departments: new PgDepartmentRepository(pool),
    rooms: new PgRoomRepository(pool),
    messages: new PgMessageRepository(pool),
    projects: new PgProjectRepository(pool),
    tasks: new PgTaskRepository(pool),
    products: new PgProductRepository(pool),
    files: new PgFileRepository(pool),
    notices: new PgNoticeRepository(pool),
    decisions: new PgDecisionRepository(pool),
    notifications: new PgNotificationRepository(pool),
    pushSubscriptions: new PgPushSubscriptionRepository(pool),
    audit: new PgAuditRepository(pool),
    refreshTokens: new PgRefreshTokenRepository(pool),
    invitations: new PgInvitationRepository(pool),
    orgNotifications: new PgOrgNotificationRepository(pool)
  };
}
