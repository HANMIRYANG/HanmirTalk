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
import { restoreMojibakeFilename } from "../files/filename";
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
  CreateScheduledMessageInput,
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
  MessageReaction,
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
  ScheduledMessage,
  ScheduledMessageStatus,
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
  UserRole,
  ProductVariant,
  ProductInventorySummary,
  Warehouse,
  InventoryBalance,
  InventoryTransaction,
  ErpDocument,
  ErpDocumentLine,
  ErpDocumentQuery,
  CreateProductVariantInput,
  UpdateProductVariantInput,
  CreateWarehouseInput,
  UpdateWarehouseInput,
  CreateErpDocumentInput,
  MesProductMapping,
  MesSyncRun,
  CreateMesProductMappingInput,
  UpdateMesProductMappingInput
} from "@hanmir/shared";
import { NOTIFICATION_CATEGORIES } from "@hanmir/shared";
import type {
  AuditRepository,
  CreateFolderRepoInput,
  CreateNotificationInput,
  CreatePushSubscriptionInput,
  DecisionRepository,
  DepartmentRepository,
  OrgNotificationRepository,
  FileRepository,
  UpdateFolderRepoInput,
  InvitationRepository,
  IssuedRefreshToken,
  MessageReactionRepository,
  MessageRepository,
  NoticeRepository,
  NotificationRepository,
  ProductRepository,
  ErpRepository,
  CreateErpDocumentResult,
  InventoryAdjustmentRow,
  ProjectRepository,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
  RefreshTokenRepository,
  Repositories,
  ResolvedRefreshToken,
  RoomRepository,
  ScheduledMessageRepository,
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
    // initial member list, if any — 한 번의 멀티행 INSERT 로.
    if (input.memberIds && input.memberIds.length > 0) {
      await this.pool.query(
        `INSERT INTO project_members (project_id, user_id, role)
         SELECT $1, unnest($2::uuid[]), 'member'
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [rows[0].id, [...new Set(input.memberIds)]]
      );
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

  async listDueCandidates(): Promise<TaskItem[]> {
    const { rows } = await this.pool.query<TaskRow>(
      `${TASK_SELECT}
       WHERE due_date IS NOT NULL AND status <> 'done'
       ORDER BY created_at ASC`
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
    -- Phase 11 — ChatList 의 last_message_* 는 timeline(top-level) 만
    -- 반영. 답글이 latest 면 사용자가 timeline 에서 같은 본문을 찾을 수
    -- 없어 혼란스럽다. drawer 안의 활동은 별도 카운트/preview 없음.
    (SELECT m.created_at FROM messages m
       WHERE m.room_id = r.id AND NOT m.is_deleted
         AND m.parent_message_id IS NULL
       ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
    (SELECT m.content FROM messages m
       WHERE m.room_id = r.id AND NOT m.is_deleted
         AND m.parent_message_id IS NULL
       ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
    (SELECT u.name FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.room_id = r.id AND NOT m.is_deleted
         AND m.parent_message_id IS NULL
       ORDER BY m.created_at DESC LIMIT 1) AS last_message_author,
    -- Per-user mute. NULL when caller has no room_members row; UI treats
    -- NULL as "not muted" anyway. notification_enabled=false ⇒ muted.
    (SELECT NOT rm3.notification_enabled FROM room_members rm3
       WHERE rm3.room_id = r.id AND rm3.user_id = $1) AS caller_muted,
    -- Unread = messages newer than this user's last_read_message and not
    -- authored by them. last_read_message resolves via room_members; when
    -- the user has no row, we treat every foreign message as unread.
    -- Phase 11 — 답글은 ChatList unread 배지에서 제외 (timeline 의 markRead
    -- 가 latest top-level id 만 추적하기 때문 — preview 와 일관). 답글의
    -- "안 봤음" 신호는 알림(notification:new) 으로 따로 전달된다.
    CASE
      WHEN $1::UUID IS NULL THEN 0
      ELSE (
        SELECT COUNT(*) FROM messages mu
        WHERE mu.room_id = r.id
          AND NOT mu.is_deleted
          AND mu.user_id <> $1
          AND mu.parent_message_id IS NULL
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
  // Phase 11 — 답글 식별자.
  parent_message_id: string | null;
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
    sourceMessageIds: row.source_message_ids ?? undefined,
    parentMessageId: row.parent_message_id ?? undefined
  };
  if (!isDeleted && row.attachment_id && row.attachment_name) {
    // 이미 깨진 채로 저장된 legacy row 의 사후 보정. ASCII / 정상 한글에는
    // 무영향 (idempotent).
    const restoredName = restoreMojibakeFilename(row.attachment_name);
    message.attachment = {
      id: row.attachment_id,
      kind: deriveFileKind(restoredName, row.attachment_type),
      name: restoredName,
      meta: row.attachment_size ? `${formatBytes(Number(row.attachment_size))}` : ""
    };
  }
  return message;
}

const MESSAGE_SELECT = `
  SELECT
    m.id, m.room_id, m.user_id, m.content, m.message_type, m.created_at,
    m.edited_at, m.is_deleted, m.entities, m.ai_generated, m.ai_command,
    m.source_message_ids, m.parent_message_id,
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
  // Phase 11 — reactions 배치 lookup + thread aggregate 가 가능하도록
  // 같은 pool 을 공유한다. reactions repo 는 옵션 — 미주입 시 reactions
  // decoration 만 생략 (테스트/마이그 미반영 환경 보호).
  constructor(
    private readonly pool: Pool,
    private readonly reactions?: MessageReactionRepository
  ) {}

  // Phase 11 — top-level 메시지들에 thread aggregate (count / lastReplyAt /
  // 최근 답글 작성자 avatars 최대 3명) 를 batch 로 채운다. soft-deleted 답글
  // 은 제외. parent_message_id 인덱스(019_idx_messages_parent_created) 가
  // 활용된다.
  private async decorateThreads(messages: ChatMessage[]): Promise<ChatMessage[]> {
    if (messages.length === 0) return messages;
    const parentIds = messages.filter((m) => !m.parentMessageId).map((m) => m.id);
    if (parentIds.length === 0) return messages;
    // 1) count + last_reply_at 집계 + 최근 작성자 3명(distinct user_id, 최근순)
    const { rows: aggRows } = await this.pool.query<{
      parent_id: string;
      reply_count: string | number;
      last_reply_at: Date | null;
      avatars_json: unknown;
    }>(
      // 최근 답글 작성자 3명 (distinct user_id, 가장 최근 답글 시각 순).
      // 이전 버전은 DISTINCT ON (user_id) + ORDER BY user_id, created_at
      // DESC + LIMIT 3 라서 user_id 정렬상 앞 3명이 뽑혔다. 사용자별 최신
      // 시각을 먼저 GROUP BY 로 구한 뒤 바깥에서 ORDER BY max_at DESC LIMIT
      // 3 로 정확히 "가장 최근에 답글 단 3명" 을 얻는다. json_agg 의
      // ORDER BY 가 응답 배열 순서까지 보장한다.
      `SELECT
         r.parent_message_id AS parent_id,
         COUNT(*) AS reply_count,
         MAX(r.created_at) AS last_reply_at,
         (
           SELECT json_agg(
                    json_build_object('initials', u2.initials, 'tone', u2.avatar_tone)
                    ORDER BY recent.max_at DESC
                  )
           FROM (
             SELECT r2.user_id, MAX(r2.created_at) AS max_at
             FROM messages r2
             WHERE r2.parent_message_id = r.parent_message_id
               AND NOT r2.is_deleted
             GROUP BY r2.user_id
             ORDER BY max_at DESC
             LIMIT 3
           ) recent
           JOIN users u2 ON u2.id = recent.user_id
         ) AS avatars_json
       FROM messages r
       WHERE r.parent_message_id = ANY($1::uuid[])
         AND NOT r.is_deleted
       GROUP BY r.parent_message_id`,
      [parentIds]
    );
    const byParent = new Map<string, { count: number; lastAt: string; avatars: { initials: string; tone?: string }[] }>();
    for (const r of aggRows) {
      const avatars = Array.isArray(r.avatars_json) ? r.avatars_json : [];
      byParent.set(r.parent_id, {
        count: Number(r.reply_count) || 0,
        lastAt: r.last_reply_at
          ? r.last_reply_at instanceof Date
            ? r.last_reply_at.toISOString()
            : String(r.last_reply_at)
          : "",
        avatars: avatars
          .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
          .map((a) => ({
            initials: String(a.initials ?? ""),
            tone: a.tone ? String(a.tone) : undefined
          }))
      });
    }
    return messages.map((m) => {
      const agg = byParent.get(m.id);
      if (!agg || agg.count === 0) return m;
      return {
        ...m,
        threadReplyCount: agg.count,
        threadLastReplyAt: agg.lastAt || undefined,
        threadReplyAvatars: agg.avatars.map((a) => ({
          initials: a.initials,
          tone: a.tone as ChatMessage["avatarTone"]
        }))
      };
    });
  }

  private async decorateReactions(
    messages: ChatMessage[],
    viewerUserId?: string
  ): Promise<ChatMessage[]> {
    if (!this.reactions || messages.length === 0) return messages;
    const ids = messages.map((m) => m.id);
    const map = await this.reactions.listForMessages(ids, viewerUserId);
    return messages.map((m) => {
      const list = map.get(m.id);
      if (!list || list.length === 0) return m;
      return { ...m, reactions: list };
    });
  }

  async listByRoom(
    roomId: string,
    viewerUserId?: string,
    opts?: { limit?: number; beforeId?: string }
  ): Promise<ChatMessage[]> {
    // Phase 2 E-1 — include soft-deleted rows so the conversation flow
    // stays intact (tombstone). rowToMessage masks the body.
    // Phase 11 — top-level only (parent_message_id IS NULL). 답글은
    // listReplies 로 별도 조회.
    // 페이지네이션: limit 가 있으면 최신 N개를 DESC 로 뽑아 reverse —
    // MESSAGE_SELECT 를 서브쿼리로 감싸지 않아도 된다. beforeId 는
    // (created_at, id) 복합 비교로 동시각 메시지 누락/중복을 방지.
    const params: unknown[] = [roomId];
    let beforeClause = "";
    if (opts?.beforeId) {
      params.push(opts.beforeId);
      beforeClause = `AND (m.created_at, m.id) <
        (SELECT created_at, id FROM messages WHERE id = $${params.length})`;
    }
    let limitClause = "";
    if (opts?.limit && opts.limit > 0) {
      params.push(opts.limit);
      limitClause = `LIMIT $${params.length}`;
    }
    const { rows } = await this.pool.query<MessageRow>(
      `${MESSAGE_SELECT}
       WHERE m.room_id = $1 AND m.parent_message_id IS NULL
       ${beforeClause}
       ORDER BY m.created_at ${limitClause ? "DESC, m.id DESC" : "ASC"}
       ${limitClause}`,
      params
    );
    const messages = rows.map(rowToMessage);
    if (limitClause) messages.reverse();
    const withThreads = await this.decorateThreads(messages);
    return this.decorateReactions(withThreads, viewerUserId);
  }

  async findById(messageId: string, viewerUserId?: string): Promise<ChatMessage | undefined> {
    const { rows } = await this.pool.query<MessageRow>(
      `${MESSAGE_SELECT} WHERE m.id = $1`,
      [messageId]
    );
    if (!rows[0]) return undefined;
    const msg = rowToMessage(rows[0]);
    const [withThread] = await this.decorateThreads([msg]);
    const [withReactions] = await this.decorateReactions([withThread], viewerUserId);
    return withReactions;
  }

  async listReplies(
    parentMessageId: string,
    viewerUserId?: string
  ): Promise<ChatMessage[]> {
    const { rows } = await this.pool.query<MessageRow>(
      `${MESSAGE_SELECT}
       WHERE m.parent_message_id = $1
       ORDER BY m.created_at ASC`,
      [parentMessageId]
    );
    const messages = rows.map(rowToMessage);
    return this.decorateReactions(messages, viewerUserId);
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

  // Phase 11 — append 와 appendReply 가 같은 row INSERT 흐름을 공유한다.
  // 둘 다 본 헬퍼로 위임하고, parent_message_id 만 다르게 박는다.
  private async insertMessageRow(
    roomId: string,
    message: ChatMessage,
    parentMessageId: string | null,
    opts?: { attachmentId?: string }
  ): Promise<ChatMessage> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO messages
         (room_id, user_id, content, message_type, entities, ai_generated,
          ai_command, source_message_ids, parent_message_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       RETURNING id`,
      [
        roomId,
        message.authorId,
        message.body,
        message.isSystem ? "system" : "text",
        JSON.stringify(message.entities ?? []),
        message.aiGenerated ?? false,
        message.aiCommand ?? null,
        message.sourceMessageIds ?? null,
        parentMessageId
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

  async append(
    roomId: string,
    message: ChatMessage,
    opts?: { attachmentId?: string }
  ): Promise<ChatMessage> {
    return this.insertMessageRow(roomId, message, null, opts);
  }

  async appendReply(
    parentMessageId: string,
    message: ChatMessage,
    opts?: { attachmentId?: string }
  ): Promise<ChatMessage> {
    return this.insertMessageRow(message.roomId, message, parentMessageId, opts);
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
  const restoredName = restoreMojibakeFilename(row.file_name);
  return {
    id: row.id,
    productId: row.product_id,
    attachmentId: row.attachment_id,
    documentType: row.document_type as ProductDocumentType,
    fileName: restoredName,
    fileKind: deriveFileKind(restoredName, row.file_type),
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
  folder_id: string | null;
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
  // legacy row 사후 보정 — ASCII / 정상 한글은 무영향.
  const restoredName = restoreMojibakeFilename(row.file_name);
  return {
    id: row.id,
    kind: deriveFileKind(restoredName, row.file_type),
    name: restoredName,
    scope,
    size: row.file_size != null ? formatBytes(Number(row.file_size)) : "",
    uploaderId: row.uploaded_by,
    uploadedAt: row.created_at instanceof Date
      ? formatDate(row.created_at)
      : String(row.created_at),
    projectId: row.project_id ?? undefined,
    productId: row.product_id ?? undefined,
    taskId: row.task_id ?? undefined,
    messageId: row.message_id ?? undefined,
    folderId: row.folder_id ?? undefined
  };
}

const ATTACHMENT_SELECT = `
  SELECT id, file_name, file_type, file_size, file_url, uploaded_by,
         project_id, product_id, task_id, message_id, folder_id, created_at
  FROM attachments
`;

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  password_hash: string | null;
  member_ids: string[] | null;
  created_by: string;
  created_at: Date;
  file_count: string | number | null;
  child_count: string | number | null;
}

function rowToFolder(row: FolderRow): FileFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? undefined,
    memberIds: row.member_ids ?? [],
    hasPassword: row.password_hash != null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    fileCount: Number(row.file_count) || 0,
    childCount: Number(row.child_count) || 0
  };
}

const FOLDER_SELECT = `
  SELECT f.id, f.name, f.parent_id, f.password_hash, f.member_ids,
         f.created_by, f.created_at,
         (SELECT COUNT(*) FROM attachments a WHERE a.folder_id = f.id) AS file_count,
         (SELECT COUNT(*) FROM file_folders c WHERE c.parent_id = f.id) AS child_count
  FROM file_folders f
`;

class PgFileRepository implements FileRepository {
  constructor(private readonly pool: Pool) {}

  async listFolders(): Promise<FileFolder[]> {
    const { rows } = await this.pool.query<FolderRow>(
      `${FOLDER_SELECT} ORDER BY f.created_at ASC`
    );
    return rows.map(rowToFolder);
  }

  async findFolderById(id: string): Promise<FileFolder | undefined> {
    const { rows } = await this.pool.query<FolderRow>(
      `${FOLDER_SELECT} WHERE f.id = $1`,
      [id]
    );
    return rows[0] ? rowToFolder(rows[0]) : undefined;
  }

  async createFolder(
    input: CreateFolderRepoInput,
    createdBy: string
  ): Promise<FileFolder> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO file_folders (name, parent_id, password_hash, member_ids, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.name,
        input.parentId ?? null,
        input.passwordHash ?? null,
        input.memberIds ?? [],
        createdBy
      ]
    );
    const created = await this.findFolderById(rows[0].id);
    if (!created) throw new Error("[postgres] failed to read back created folder");
    return created;
  }

  async updateFolder(
    id: string,
    input: UpdateFolderRepoInput
  ): Promise<FileFolder | undefined> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name = $${params.length}`);
    }
    if (input.memberIds !== undefined) {
      params.push(input.memberIds);
      sets.push(`member_ids = $${params.length}`);
    }
    if (sets.length === 0) return this.findFolderById(id);
    sets.push("updated_at = NOW()");
    params.push(id);
    await this.pool.query(
      `UPDATE file_folders SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params
    );
    return this.findFolderById(id);
  }

  async deleteFolder(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM file_folders WHERE id = $1`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  }

  async folderPasswordHash(id: string): Promise<string | null | undefined> {
    const { rows } = await this.pool.query<{ password_hash: string | null }>(
      `SELECT password_hash FROM file_folders WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return undefined;
    return rows[0].password_hash;
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
    add("folder_id", filter?.folderId);
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
         project_id, product_id, task_id, message_id, folder_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        input.messageId ?? null,
        input.folderId ?? null
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
      // legacy row 사후 보정. 다운로드 응답 헤더(`res.download(abs, fileName)`)
      // 가 이 값을 그대로 사용하므로, 깨진 이름이 그대로 클라이언트에 노출
      // 되지 않도록 같은 헬퍼를 통과시킨다.
      fileName: restoreMojibakeFilename(rows[0].file_name),
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

  async getSettingsMany(userIds: string[]): Promise<Map<string, NotificationSettings>> {
    const out = new Map<string, NotificationSettings>();
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return out;
    await this.pool.query(
      `INSERT INTO user_notification_settings (user_id)
       SELECT unnest($1::uuid[])
       ON CONFLICT (user_id) DO NOTHING`,
      [unique]
    );
    const { rows } = await this.pool.query<SettingsRow>(
      `SELECT user_id, all_enabled, per_room, per_project,
              web_push_enabled, browser_enabled
         FROM user_notification_settings
        WHERE user_id = ANY($1::uuid[])`,
      [unique]
    );
    for (const row of rows) {
      const s = rowToSettings(row);
      out.set(s.userId, s);
    }
    return out;
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

// Phase 10 M-4 — 예약 메시지. status 는 row 컬럼 조합에서 파생.
class PgScheduledMessageRepository implements ScheduledMessageRepository {
  constructor(private readonly pool: Pool) {}

  private rowToDto(r: {
    id: string;
    room_id: string;
    user_id: string;
    content: string;
    entities: unknown;
    attachment_id: string | null;
    scheduled_at: Date | string;
    sent_at: Date | string | null;
    cancelled_at: Date | string | null;
    error: string | null;
    created_at: Date | string;
    room_name?: string | null;
    author_name?: string | null;
    attachment_name?: string | null;
  }): ScheduledMessage {
    const sentAt = r.sent_at
      ? r.sent_at instanceof Date
        ? r.sent_at.toISOString()
        : String(r.sent_at)
      : undefined;
    const cancelledAt = r.cancelled_at
      ? r.cancelled_at instanceof Date
        ? r.cancelled_at.toISOString()
        : String(r.cancelled_at)
      : undefined;
    const status: ScheduledMessageStatus = sentAt
      ? "sent"
      : cancelledAt
      ? "cancelled"
      : r.error
      ? "failed"
      : "pending";
    const entities = Array.isArray(r.entities)
      ? (r.entities as MessageEntity[])
      : [];
    return {
      id: r.id,
      roomId: r.room_id,
      roomName: r.room_name ?? undefined,
      userId: r.user_id,
      authorName: r.author_name ?? undefined,
      content: r.content,
      entities,
      attachmentId: r.attachment_id ?? undefined,
      attachmentName: r.attachment_name
        ? restoreMojibakeFilename(r.attachment_name)
        : undefined,
      scheduledAt:
        r.scheduled_at instanceof Date
          ? r.scheduled_at.toISOString()
          : String(r.scheduled_at),
      sentAt,
      cancelledAt,
      error: r.error ?? undefined,
      status,
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at)
    };
  }

  // Common JOIN for list/find — pulls room/author/attachment name in one shot.
  private readonly SELECT_BASE = `
    SELECT s.id, s.room_id, s.user_id, s.content, s.entities, s.attachment_id,
           s.scheduled_at, s.sent_at, s.cancelled_at, s.error, s.created_at,
           r.name AS room_name,
           u.name AS author_name,
           a.file_name AS attachment_name
      FROM scheduled_messages s
      LEFT JOIN rooms r ON r.id = s.room_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN attachments a ON a.id = s.attachment_id
  `;

  async create(
    input: CreateScheduledMessageInput,
    author: { id: string }
  ): Promise<ScheduledMessage> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO scheduled_messages
         (room_id, user_id, content, entities, attachment_id, scheduled_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id`,
      [
        input.roomId,
        author.id,
        input.content,
        JSON.stringify(input.entities ?? []),
        input.attachmentId ?? null,
        new Date(input.scheduledAt)
      ]
    );
    const created = await this.findById(rows[0].id);
    return created!;
  }

  async findById(id: string): Promise<ScheduledMessage | undefined> {
    const { rows } = await this.pool.query(
      `${this.SELECT_BASE} WHERE s.id = $1`,
      [id]
    );
    return rows[0] ? this.rowToDto(rows[0]) : undefined;
  }

  async listForUser(
    userId: string,
    opts: { roomId?: string; includeAll?: boolean } = {}
  ): Promise<ScheduledMessage[]> {
    const wheres: string[] = ["s.user_id = $1"];
    const params: unknown[] = [userId];
    if (opts.roomId) {
      params.push(opts.roomId);
      wheres.push(`s.room_id = $${params.length}`);
    }
    if (!opts.includeAll) {
      wheres.push("s.sent_at IS NULL AND s.cancelled_at IS NULL");
    }
    const { rows } = await this.pool.query(
      `${this.SELECT_BASE} WHERE ${wheres.join(" AND ")} ORDER BY s.scheduled_at ASC`,
      params
    );
    return rows.map((r) => this.rowToDto(r));
  }

  async listDue(now: Date): Promise<ScheduledMessage[]> {
    const { rows } = await this.pool.query(
      `${this.SELECT_BASE}
         WHERE s.scheduled_at <= $1
           AND s.sent_at IS NULL
           AND s.cancelled_at IS NULL
           AND s.error IS NULL
         ORDER BY s.scheduled_at ASC
         LIMIT 200`,
      [now]
    );
    return rows.map((r) => this.rowToDto(r));
  }

  async markSent(id: string, now: Date): Promise<boolean> {
    // Pending-only guard — 동시 호출이 같은 row 를 잡아도 한 번만 true.
    // listDue 이후 사용자가 취소한 row 는 여기서 claim 되면 안 된다.
    const { rowCount } = await this.pool.query(
      `UPDATE scheduled_messages
          SET sent_at = $2
        WHERE id = $1
          AND sent_at IS NULL
          AND cancelled_at IS NULL
          AND error IS NULL`,
      [id, now]
    );
    return (rowCount ?? 0) > 0;
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE scheduled_messages
          SET error = $2
        WHERE id = $1
          AND sent_at IS NULL
          AND cancelled_at IS NULL
          AND error IS NULL`,
      [id, error.slice(0, 500)]
    );
  }

  async cancel(id: string, now: Date): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE scheduled_messages
          SET cancelled_at = $2
        WHERE id = $1 AND sent_at IS NULL AND cancelled_at IS NULL`,
      [id, now]
    );
    return (rowCount ?? 0) > 0;
  }
}

// Phase 11 — 이모지 반응 (Postgres). 동일 emoji 의 중복 추가는 PK
// (message_id, user_id, emoji) 충돌이므로 INSERT … ON CONFLICT DO NOTHING
// 로 idempotent. 토글 UX 는 라우트가 PUT/DELETE 로 처리한다.
class PgMessageReactionRepository implements MessageReactionRepository {
  constructor(private readonly pool: Pool) {}

  async add(messageId: string, userId: string, emoji: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [messageId, userId, emoji]
    );
    return (rowCount ?? 0) > 0;
  }

  async remove(messageId: string, userId: string, emoji: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM message_reactions
        WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji]
    );
    return (rowCount ?? 0) > 0;
  }

  async listForMessage(
    messageId: string,
    viewerUserId?: string
  ): Promise<MessageReaction[]> {
    const map = await this.listForMessages([messageId], viewerUserId);
    return map.get(messageId) ?? [];
  }

  async listForMessages(
    messageIds: string[],
    viewerUserId?: string
  ): Promise<Map<string, MessageReaction[]>> {
    const out = new Map<string, MessageReaction[]>();
    if (messageIds.length === 0) return out;
    const { rows } = await this.pool.query<{
      message_id: string;
      emoji: string;
      count: string;
      mine: boolean;
    }>(
      `SELECT
         message_id,
         emoji,
         COUNT(*) AS count,
         BOOL_OR(user_id = $2) AS mine
       FROM message_reactions
       WHERE message_id = ANY($1::uuid[])
       GROUP BY message_id, emoji
       ORDER BY message_id, COUNT(*) DESC, emoji ASC`,
      [messageIds, viewerUserId ?? null]
    );
    for (const r of rows) {
      const list = out.get(r.message_id) ?? [];
      list.push({
        emoji: r.emoji,
        count: Number(r.count) || 0,
        reactedByMe: r.mine ? true : undefined
      });
      out.set(r.message_id, list);
    }
    return out;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Phase 12 — ERP 재고/전표 + MES 매핑.
// 재고 차감/복원은 documents/lines/transactions/balances 를 단일 트랜잭션
// (BEGIN…COMMIT)으로 처리하고, 잔량 검사는 inventory_balances 를 FOR UPDATE
// 로 잠근 뒤 수행해 동시 차감 경합을 막는다. NUMERIC 컬럼은 pg 가 문자열로
// 돌려주므로 num() 으로 파싱한다.
// ───────────────────────────────────────────────────────────────────────
function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2pg(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToVariant(r: any): ProductVariant {
  return {
    id: r.id,
    productId: r.product_id,
    code: r.code,
    name: r.name,
    unitLabel: r.unit_label,
    kgPerUnit: num(r.kg_per_unit),
    sortOrder: r.sort_order,
    isActive: r.is_active,
    createdAt: formatDate(r.created_at),
    updatedAt: formatDate(r.updated_at)
  };
}

function rowToWarehouse(r: any): Warehouse {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    isActive: r.is_active,
    createdAt: formatDate(r.created_at),
    updatedAt: formatDate(r.updated_at)
  };
}

function rowToTransaction(r: any): InventoryTransaction {
  return {
    id: r.id,
    productId: r.product_id,
    productVariantId: r.product_variant_id,
    warehouseId: r.warehouse_id,
    direction: r.direction,
    quantity: num(r.quantity),
    unitLabel: r.unit_label,
    kgPerUnitSnapshot: num(r.kg_per_unit_snapshot),
    quantityKg: num(r.quantity_kg),
    sourceType: r.source_type ?? undefined,
    sourceId: r.source_id ?? undefined,
    lotId: r.lot_id ?? undefined,
    note: r.note ?? undefined,
    createdById: r.created_by,
    createdByName: r.created_by_name ?? undefined,
    createdAt: formatDate(r.created_at),
    externalRef: r.external_ref ?? undefined,
    syncStatus: r.sync_status ?? undefined,
    lastSyncedAt: r.last_synced_at ? formatDate(r.last_synced_at) : undefined
  };
}

function rowToErpLine(r: any): ErpDocumentLine {
  return {
    id: r.id,
    documentId: r.document_id,
    lineNo: r.line_no,
    productId: r.product_id ?? undefined,
    productVariantId: r.product_variant_id ?? undefined,
    warehouseId: r.warehouse_id ?? undefined,
    itemCode: r.item_code ?? undefined,
    itemName: r.item_name ?? undefined,
    specLabel: r.spec_label ?? undefined,
    quantity: num(r.quantity),
    unitPrice: num(r.unit_price),
    supplyAmount: num(r.supply_amount),
    vatAmount: num(r.vat_amount),
    note: r.note ?? undefined,
    serialLot: r.serial_lot ?? undefined,
    createdAt: formatDate(r.created_at)
  };
}

function rowToErpDocument(r: any, lines: ErpDocumentLine[]): ErpDocument {
  return {
    id: r.id,
    documentNo: r.document_no,
    documentType: r.document_type,
    status: r.status,
    documentDate: formatDate(r.document_date),
    managerId: r.manager_id ?? undefined,
    managerName: r.manager_name ?? undefined,
    customerName: r.customer_name ?? undefined,
    warehouseId: r.warehouse_id ?? undefined,
    warehouseName: r.warehouse_name ?? undefined,
    transactionType: r.transaction_type ?? undefined,
    currency: r.currency,
    contact: r.contact ?? undefined,
    address: r.address ?? undefined,
    supplyAmount: num(r.supply_amount),
    vatAmount: num(r.vat_amount),
    totalAmount: num(r.total_amount),
    note: r.note ?? undefined,
    createdById: r.created_by,
    createdByName: r.created_by_name ?? undefined,
    createdAt: formatDate(r.created_at),
    updatedAt: formatDate(r.updated_at),
    cancelledAt: r.cancelled_at ? formatDate(r.cancelled_at) : undefined,
    lines,
    externalRef: r.external_ref ?? undefined,
    syncStatus: r.sync_status ?? undefined,
    lastSyncedAt: r.last_synced_at ? formatDate(r.last_synced_at) : undefined
  };
}

function rowToMesMapping(r: any): MesProductMapping {
  return {
    id: r.id,
    productId: r.product_id,
    productVariantId: r.product_variant_id ?? undefined,
    mesProductId: r.mes_product_id ?? undefined,
    mesItemCode: r.mes_item_code ?? undefined,
    mesUnitLabel: r.mes_unit_label ?? undefined,
    isActive: r.is_active,
    createdAt: formatDate(r.created_at),
    updatedAt: formatDate(r.updated_at)
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ERP_DOC_HEADER_SELECT = `
  SELECT d.*, m.name AS manager_name, w.name AS warehouse_name, c.name AS created_by_name
  FROM erp_documents d
  LEFT JOIN users m ON m.id = d.manager_id
  LEFT JOIN warehouses w ON w.id = d.warehouse_id
  LEFT JOIN users c ON c.id = d.created_by
`;

class PgErpRepository implements ErpRepository {
  constructor(private readonly pool: Pool) {}

  // ── 규격 ──
  async listVariants(productId: string): Promise<ProductVariant[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY sort_order, created_at`,
      [productId]
    );
    return rows.map(rowToVariant);
  }

  async listAllVariants(): Promise<ProductVariant[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM product_variants ORDER BY product_id, sort_order`
    );
    return rows.map(rowToVariant);
  }

  async findVariantById(id: string): Promise<ProductVariant | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM product_variants WHERE id = $1`, [id]);
    return rows[0] ? rowToVariant(rows[0]) : undefined;
  }

  async createVariant(
    productId: string,
    input: CreateProductVariantInput
  ): Promise<ProductVariant> {
    const { rows } = await this.pool.query(
      `INSERT INTO product_variants
         (product_id, code, name, unit_label, kg_per_unit, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5,
               COALESCE($6, (SELECT COUNT(*) FROM product_variants WHERE product_id = $1)),
               COALESCE($7, TRUE))
       RETURNING *`,
      [
        productId,
        input.code,
        input.name,
        input.unitLabel,
        input.kgPerUnit ?? 0,
        input.sortOrder ?? null,
        input.isActive ?? null
      ]
    );
    return rowToVariant(rows[0]);
  }

  async updateVariant(
    id: string,
    input: UpdateProductVariantInput
  ): Promise<ProductVariant | undefined> {
    const { rows } = await this.pool.query(
      `UPDATE product_variants SET
         code = COALESCE($2, code),
         name = COALESCE($3, name),
         unit_label = COALESCE($4, unit_label),
         kg_per_unit = COALESCE($5, kg_per_unit),
         sort_order = COALESCE($6, sort_order),
         is_active = COALESCE($7, is_active),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.code ?? null,
        input.name ?? null,
        input.unitLabel ?? null,
        input.kgPerUnit ?? null,
        input.sortOrder ?? null,
        input.isActive ?? null
      ]
    );
    return rows[0] ? rowToVariant(rows[0]) : undefined;
  }

  // ── 창고 ──
  async listWarehouses(): Promise<Warehouse[]> {
    const { rows } = await this.pool.query(`SELECT * FROM warehouses ORDER BY code`);
    return rows.map(rowToWarehouse);
  }

  async findWarehouseById(id: string): Promise<Warehouse | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM warehouses WHERE id = $1`, [id]);
    return rows[0] ? rowToWarehouse(rows[0]) : undefined;
  }

  async createWarehouse(input: CreateWarehouseInput): Promise<Warehouse> {
    const { rows } = await this.pool.query(
      `INSERT INTO warehouses (code, name, is_active)
       VALUES ($1, $2, COALESCE($3, TRUE)) RETURNING *`,
      [input.code, input.name, input.isActive ?? null]
    );
    return rowToWarehouse(rows[0]);
  }

  async updateWarehouse(
    id: string,
    input: UpdateWarehouseInput
  ): Promise<Warehouse | undefined> {
    const { rows } = await this.pool.query(
      `UPDATE warehouses SET
         code = COALESCE($2, code),
         name = COALESCE($3, name),
         is_active = COALESCE($4, is_active),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, input.code ?? null, input.name ?? null, input.isActive ?? null]
    );
    return rows[0] ? rowToWarehouse(rows[0]) : undefined;
  }

  // ── 재고 ──
  async listInventory(filter: {
    productId?: string;
    warehouseId?: string;
  }): Promise<InventoryBalance[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.productId) {
      params.push(filter.productId);
      where.push(`v.product_id = $${params.length}`);
    }
    if (filter.warehouseId) {
      params.push(filter.warehouseId);
      where.push(`b.warehouse_id = $${params.length}`);
    }
    const { rows } = await this.pool.query(
      `SELECT b.*, v.product_id, v.code AS variant_code, v.name AS variant_name,
              v.unit_label, p.name AS product_name,
              w.code AS warehouse_code, w.name AS warehouse_name
       FROM inventory_balances b
       JOIN product_variants v ON v.id = b.product_variant_id
       LEFT JOIN products p ON p.id = v.product_id
       LEFT JOIN warehouses w ON w.id = b.warehouse_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY p.name, v.sort_order, w.code`,
      params
    );
    return rows.map((r) => ({
      productVariantId: r.product_variant_id,
      warehouseId: r.warehouse_id,
      quantity: num(r.quantity),
      quantityKg: num(r.quantity_kg),
      updatedAt: formatDate(r.updated_at),
      productId: r.product_id ?? undefined,
      productName: r.product_name ?? undefined,
      variantCode: r.variant_code ?? undefined,
      variantName: r.variant_name ?? undefined,
      unitLabel: r.unit_label ?? undefined,
      warehouseCode: r.warehouse_code ?? undefined,
      warehouseName: r.warehouse_name ?? undefined
    }));
  }

  async getProductInventorySummary(productId: string): Promise<ProductInventorySummary> {
    const { rows } = await this.pool.query(
      `SELECT v.id AS variant_id, v.code AS variant_code, v.name AS variant_name,
              v.unit_label, v.kg_per_unit, v.sort_order,
              b.warehouse_id, b.quantity, b.quantity_kg,
              w.code AS warehouse_code, w.name AS warehouse_name
       FROM product_variants v
       LEFT JOIN inventory_balances b ON b.product_variant_id = v.id
       LEFT JOIN warehouses w ON w.id = b.warehouse_id
       WHERE v.product_id = $1
       ORDER BY v.sort_order, w.code`,
      [productId]
    );
    const byVariant = new Map<string, ProductInventorySummary["variants"][number]>();
    let totalKg = 0;
    for (const r of rows) {
      let entry = byVariant.get(r.variant_id);
      if (!entry) {
        entry = {
          productVariantId: r.variant_id,
          variantCode: r.variant_code,
          variantName: r.variant_name,
          unitLabel: r.unit_label,
          kgPerUnit: num(r.kg_per_unit),
          totalQuantity: 0,
          totalKg: 0,
          byWarehouse: []
        };
        byVariant.set(r.variant_id, entry);
      }
      if (r.warehouse_id) {
        const qty = num(r.quantity);
        const qtyKg = num(r.quantity_kg);
        entry.totalQuantity = round2pg(entry.totalQuantity + qty);
        entry.totalKg = round2pg(entry.totalKg + qtyKg);
        totalKg += qtyKg;
        entry.byWarehouse.push({
          warehouseId: r.warehouse_id,
          warehouseCode: r.warehouse_code ?? "",
          warehouseName: r.warehouse_name ?? "",
          quantity: qty,
          quantityKg: round2pg(qtyKg)
        });
      }
    }
    return {
      productId,
      totalKg: round2pg(totalKg),
      variants: Array.from(byVariant.values())
    };
  }

  async listTransactions(filter: {
    productId?: string;
    productVariantId?: string;
    warehouseId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<InventoryTransaction[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace("$?", `$${params.length}`));
    };
    if (filter.productId) add("t.product_id = $?", filter.productId);
    if (filter.productVariantId) add("t.product_variant_id = $?", filter.productVariantId);
    if (filter.warehouseId) add("t.warehouse_id = $?", filter.warehouseId);
    if (filter.from) add("t.created_at >= $?", filter.from);
    if (filter.to) add("t.created_at <= $?", filter.to);
    const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 1000) : 200;
    const { rows } = await this.pool.query(
      `SELECT t.*, u.name AS created_by_name
       FROM inventory_transactions t
       LEFT JOIN users u ON u.id = t.created_by
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY t.created_at DESC
       LIMIT ${limit}`,
      params
    );
    return rows.map(rowToTransaction);
  }

  async importInventory(
    rows: InventoryAdjustmentRow[],
    actor: { id: string }
  ): Promise<{ applied: number }> {
    const client = await this.pool.connect();
    let applied = 0;
    try {
      await client.query("BEGIN");
      for (const row of rows) {
        const v = await client.query(
          `SELECT product_id, unit_label, kg_per_unit FROM product_variants WHERE id = $1`,
          [row.productVariantId]
        );
        if (!v.rows[0]) continue;
        const wh = await client.query(`SELECT 1 FROM warehouses WHERE id = $1`, [row.warehouseId]);
        if (!wh.rows[0]) continue;
        const kgPerUnit = num(v.rows[0].kg_per_unit);
        const deltaKg = round2pg(row.quantity * kgPerUnit);
        await client.query(
          `INSERT INTO inventory_balances
             (product_variant_id, warehouse_id, quantity, quantity_kg, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (product_variant_id, warehouse_id) DO UPDATE
             SET quantity = inventory_balances.quantity + EXCLUDED.quantity,
                 quantity_kg = inventory_balances.quantity_kg + EXCLUDED.quantity_kg,
                 updated_at = NOW()`,
          [row.productVariantId, row.warehouseId, row.quantity, deltaKg]
        );
        await client.query(
          `INSERT INTO inventory_transactions
             (product_id, product_variant_id, warehouse_id, direction, quantity,
              unit_label, kg_per_unit_snapshot, quantity_kg, source_type, note, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'import', $9, $10)`,
          [
            v.rows[0].product_id,
            row.productVariantId,
            row.warehouseId,
            row.direction ?? "adjust",
            row.quantity,
            v.rows[0].unit_label,
            kgPerUnit,
            deltaKg,
            row.note ?? null,
            actor.id
          ]
        );
        applied++;
      }
      await client.query("COMMIT");
      return { applied };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ── 전표 ──
  async createDocument(
    input: CreateErpDocumentInput,
    actor: { id: string }
  ): Promise<CreateErpDocumentResult> {
    if (!input.lines || input.lines.length === 0) {
      return { ok: false, error: "empty_lines" };
    }
    const headerWarehouseId = input.warehouseId;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 참조 무결성 — 라인이 가리키는 규격/창고가 실제 존재하는지.
      const variantIds = Array.from(
        new Set(input.lines.map((l) => l.productVariantId).filter(Boolean) as string[])
      );
      const variantMap = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (variantIds.length) {
        const v = await client.query(
          `SELECT * FROM product_variants WHERE id = ANY($1)`,
          [variantIds]
        );
        for (const r of v.rows) variantMap.set(r.id, r);
        if (variantMap.size !== variantIds.length) {
          await client.query("ROLLBACK");
          return { ok: false, error: "variant_not_found" };
        }
      }
      const warehouseIds = Array.from(
        new Set(
          input.lines
            .map((l) => l.warehouseId ?? headerWarehouseId)
            .filter(Boolean) as string[]
        )
      );
      if (warehouseIds.length) {
        const w = await client.query(`SELECT id FROM warehouses WHERE id = ANY($1)`, [
          warehouseIds
        ]);
        if (w.rows.length !== warehouseIds.length) {
          await client.query("ROLLBACK");
          return { ok: false, error: "warehouse_not_found" };
        }
      }

      // 차감 대상(규격+창고 지정) 라인의 잔량을 FOR UPDATE 로 잠그고 검사.
      const shortages: {
        productVariantId: string;
        warehouseId: string;
        available: number;
        requested: number;
      }[] = [];
      for (const line of input.lines) {
        const warehouseId = line.warehouseId ?? headerWarehouseId;
        if (!line.productVariantId || !warehouseId) continue;
        const bal = await client.query(
          `SELECT quantity FROM inventory_balances
           WHERE product_variant_id = $1 AND warehouse_id = $2 FOR UPDATE`,
          [line.productVariantId, warehouseId]
        );
        const available = bal.rows[0] ? num(bal.rows[0].quantity) : 0;
        if (!input.allowNegative && line.quantity > available) {
          shortages.push({
            productVariantId: line.productVariantId,
            warehouseId,
            available,
            requested: line.quantity
          });
        }
      }
      if (shortages.length > 0) {
        await client.query("ROLLBACK");
        return { ok: false, error: "insufficient_stock", shortages };
      }

      // 채번 — 전역 연번.
      const documentType = input.documentType ?? "sale";
      const seqRes = await client.query(`SELECT nextval('erp_doc_seq') AS n`);
      const seq = num(seqRes.rows[0].n);
      const prefix = documentType === "use" ? "USE" : "SALE";
      const documentNo = `${prefix}-${String(seq).padStart(6, "0")}`;

      // 금액 집계.
      let supplyTotal = 0;
      let vatTotal = 0;
      const prepared = input.lines.map((line, i) => {
        const supplyAmount = line.supplyAmount ?? round2pg(line.quantity * (line.unitPrice ?? 0));
        const vatAmount = line.vatAmount ?? round2pg(supplyAmount * 0.1);
        supplyTotal += supplyAmount;
        vatTotal += vatAmount;
        return { line, lineNo: i + 1, supplyAmount, vatAmount };
      });

      const docRes = await client.query(
        `INSERT INTO erp_documents
           (document_no, document_type, status, document_date, manager_id, customer_name,
            warehouse_id, transaction_type, currency, contact, address,
            supply_amount, vat_amount, total_amount, note, created_by)
         VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, COALESCE($8,'KRW'), $9, $10,
                 $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          documentNo,
          documentType,
          input.documentDate,
          input.managerId ?? null,
          input.customerName ?? null,
          headerWarehouseId ?? null,
          input.transactionType ?? null,
          input.currency ?? null,
          input.contact ?? null,
          input.address ?? null,
          round2pg(supplyTotal),
          round2pg(vatTotal),
          round2pg(supplyTotal + vatTotal),
          input.note ?? null,
          actor.id
        ]
      );
      const documentId = docRes.rows[0].id;

      for (const p of prepared) {
        const warehouseId = p.line.warehouseId ?? headerWarehouseId;
        const variant = p.line.productVariantId
          ? variantMap.get(p.line.productVariantId)
          : undefined;
        await client.query(
          `INSERT INTO erp_document_lines
             (document_id, line_no, product_id, product_variant_id, warehouse_id,
              item_code, item_name, spec_label, quantity, unit_price,
              supply_amount, vat_amount, note, serial_lot)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            documentId,
            p.lineNo,
            variant?.product_id ?? p.line.productId ?? null,
            p.line.productVariantId ?? null,
            warehouseId ?? null,
            p.line.itemCode ?? null,
            p.line.itemName ?? null,
            p.line.specLabel ?? variant?.name ?? null,
            p.line.quantity,
            p.line.unitPrice ?? 0,
            p.supplyAmount,
            p.vatAmount,
            p.line.note ?? null,
            p.line.serialLot ?? null
          ]
        );
        // 재고 차감 + 거래 원장.
        if (variant && warehouseId) {
          const kgPerUnit = num(variant.kg_per_unit);
          const deltaKg = round2pg(p.line.quantity * kgPerUnit);
          await client.query(
            `INSERT INTO inventory_balances
               (product_variant_id, warehouse_id, quantity, quantity_kg, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (product_variant_id, warehouse_id) DO UPDATE
               SET quantity = inventory_balances.quantity + EXCLUDED.quantity,
                   quantity_kg = inventory_balances.quantity_kg + EXCLUDED.quantity_kg,
                   updated_at = NOW()`,
            [p.line.productVariantId, warehouseId, -p.line.quantity, -deltaKg]
          );
          await client.query(
            `INSERT INTO inventory_transactions
               (product_id, product_variant_id, warehouse_id, direction, quantity,
                unit_label, kg_per_unit_snapshot, quantity_kg, source_type, source_id,
                note, created_by)
             VALUES ($1, $2, $3, 'out', $4, $5, $6, $7, 'erp_document', $8, $9, $10)`,
            [
              variant.product_id,
              p.line.productVariantId,
              warehouseId,
              p.line.quantity,
              variant.unit_label,
              kgPerUnit,
              deltaKg,
              documentId,
              p.line.note ?? null,
              actor.id
            ]
          );
        }
      }

      await client.query("COMMIT");
      const document = await this.findDocumentById(documentId);
      if (!document) throw new Error("[postgres] failed to read back created erp document");
      return { ok: true, document };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async listDocuments(query: ErpDocumentQuery): Promise<ErpDocument[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace("$?", `$${params.length}`));
    };
    if (query.type) add("d.document_type = $?", query.type);
    if (query.status) add("d.status = $?", query.status);
    if (query.from) add("d.document_date >= $?", query.from);
    if (query.to) add("d.document_date <= $?", query.to);
    if (query.customer) add("d.customer_name ILIKE $?", `%${query.customer}%`);
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 500) : 100;
    const { rows } = await this.pool.query(
      `${ERP_DOC_HEADER_SELECT}
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY d.document_date DESC, d.created_at DESC
       LIMIT ${limit}`,
      params
    );
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const { rows: lineRows } = await this.pool.query(
      `SELECT * FROM erp_document_lines WHERE document_id = ANY($1) ORDER BY document_id, line_no`,
      [ids]
    );
    const linesByDoc = new Map<string, ErpDocumentLine[]>();
    for (const lr of lineRows) {
      const arr = linesByDoc.get(lr.document_id) ?? [];
      arr.push(rowToErpLine(lr));
      linesByDoc.set(lr.document_id, arr);
    }
    return rows.map((r) => rowToErpDocument(r, linesByDoc.get(r.id) ?? []));
  }

  async findDocumentById(id: string): Promise<ErpDocument | undefined> {
    const { rows } = await this.pool.query(`${ERP_DOC_HEADER_SELECT} WHERE d.id = $1`, [id]);
    if (!rows[0]) return undefined;
    const { rows: lineRows } = await this.pool.query(
      `SELECT * FROM erp_document_lines WHERE document_id = $1 ORDER BY line_no`,
      [id]
    );
    return rowToErpDocument(rows[0], lineRows.map(rowToErpLine));
  }

  async cancelDocument(
    id: string,
    actor: { id: string }
  ): Promise<ErpDocument | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const doc = await client.query(
        `SELECT id, status FROM erp_documents WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (!doc.rows[0] || doc.rows[0].status === "cancelled") {
        await client.query("ROLLBACK");
        return undefined;
      }
      const lines = await client.query(
        `SELECT l.*, v.kg_per_unit, v.unit_label
         FROM erp_document_lines l
         LEFT JOIN product_variants v ON v.id = l.product_variant_id
         WHERE l.document_id = $1`,
        [id]
      );
      for (const line of lines.rows) {
        if (!line.product_variant_id || !line.warehouse_id) continue;
        const kgPerUnit = num(line.kg_per_unit);
        const qty = num(line.quantity);
        const deltaKg = round2pg(qty * kgPerUnit);
        await client.query(
          `INSERT INTO inventory_balances
             (product_variant_id, warehouse_id, quantity, quantity_kg, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (product_variant_id, warehouse_id) DO UPDATE
             SET quantity = inventory_balances.quantity + EXCLUDED.quantity,
                 quantity_kg = inventory_balances.quantity_kg + EXCLUDED.quantity_kg,
                 updated_at = NOW()`,
          [line.product_variant_id, line.warehouse_id, qty, deltaKg]
        );
        await client.query(
          `INSERT INTO inventory_transactions
             (product_id, product_variant_id, warehouse_id, direction, quantity,
              unit_label, kg_per_unit_snapshot, quantity_kg, source_type, source_id, created_by)
           VALUES ($1, $2, $3, 'cancel', $4, $5, $6, $7, 'erp_document_cancel', $8, $9)`,
          [
            line.product_id,
            line.product_variant_id,
            line.warehouse_id,
            qty,
            line.unit_label ?? "",
            kgPerUnit,
            deltaKg,
            id,
            actor.id
          ]
        );
      }
      await client.query(
        `UPDATE erp_documents SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
      await client.query("COMMIT");
      return this.findDocumentById(id);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ── MES 매핑(골격) ──
  async listMesMappings(productId?: string): Promise<MesProductMapping[]> {
    const { rows } = productId
      ? await this.pool.query(
          `SELECT * FROM mes_product_mappings WHERE product_id = $1 ORDER BY created_at`,
          [productId]
        )
      : await this.pool.query(`SELECT * FROM mes_product_mappings ORDER BY created_at`);
    return rows.map(rowToMesMapping);
  }

  async createMesMapping(input: CreateMesProductMappingInput): Promise<MesProductMapping> {
    const { rows } = await this.pool.query(
      `INSERT INTO mes_product_mappings
         (product_id, product_variant_id, mes_product_id, mes_item_code, mes_unit_label, is_active)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE)) RETURNING *`,
      [
        input.productId,
        input.productVariantId ?? null,
        input.mesProductId ?? null,
        input.mesItemCode ?? null,
        input.mesUnitLabel ?? null,
        input.isActive ?? null
      ]
    );
    return rowToMesMapping(rows[0]);
  }

  async updateMesMapping(
    id: string,
    input: UpdateMesProductMappingInput
  ): Promise<MesProductMapping | undefined> {
    const { rows } = await this.pool.query(
      `UPDATE mes_product_mappings SET
         product_variant_id = COALESCE($2, product_variant_id),
         mes_product_id = COALESCE($3, mes_product_id),
         mes_item_code = COALESCE($4, mes_item_code),
         mes_unit_label = COALESCE($5, mes_unit_label),
         is_active = COALESCE($6, is_active),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.productVariantId ?? null,
        input.mesProductId ?? null,
        input.mesItemCode ?? null,
        input.mesUnitLabel ?? null,
        input.isActive ?? null
      ]
    );
    return rows[0] ? rowToMesMapping(rows[0]) : undefined;
  }

  async listMesSyncRuns(limit?: number): Promise<MesSyncRun[]> {
    const lim = limit && limit > 0 ? Math.min(limit, 200) : 50;
    const { rows } = await this.pool.query(
      `SELECT * FROM mes_sync_runs ORDER BY started_at DESC LIMIT ${lim}`
    );
    return rows.map((r) => ({
      id: r.id,
      direction: r.direction,
      status: r.status,
      startedAt: formatDate(r.started_at),
      finishedAt: r.finished_at ? formatDate(r.finished_at) : undefined,
      errorMessage: r.error_message ?? undefined,
      meta: r.meta ?? undefined
    }));
  }
}

export function createPostgresRepositories(pool: Pool): Repositories {
  const users = new PgUserRepository(pool);
  // Phase 11 — message repo 가 reactions 배치 lookup 을 사용하므로 reactions
  // 를 먼저 만들어 주입한다.
  const messageReactions = new PgMessageReactionRepository(pool);
  return {
    users,
    departments: new PgDepartmentRepository(pool),
    rooms: new PgRoomRepository(pool),
    messages: new PgMessageRepository(pool, messageReactions),
    projects: new PgProjectRepository(pool),
    tasks: new PgTaskRepository(pool),
    products: new PgProductRepository(pool),
    erp: new PgErpRepository(pool),
    files: new PgFileRepository(pool),
    notices: new PgNoticeRepository(pool),
    decisions: new PgDecisionRepository(pool),
    notifications: new PgNotificationRepository(pool),
    pushSubscriptions: new PgPushSubscriptionRepository(pool),
    audit: new PgAuditRepository(pool),
    refreshTokens: new PgRefreshTokenRepository(pool),
    invitations: new PgInvitationRepository(pool),
    orgNotifications: new PgOrgNotificationRepository(pool),
    scheduledMessages: new PgScheduledMessageRepository(pool),
    messageReactions
  };
}
