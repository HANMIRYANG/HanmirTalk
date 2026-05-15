import { randomBytes } from "crypto";
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
  Room,
  TaskItem,
  UpdateDepartmentInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateUserInput,
  User
} from "@hanmir/shared";
import { seedUsers } from "../seed/users";
import { seedDepartments } from "../seed/departments";
import { seedRooms } from "../seed/rooms";
import { seedMessages, seedPinnedMessages } from "../seed/messages";
import { seedProjects } from "../seed/projects";
import { seedTasks } from "../seed/tasks";
import { seedProducts } from "../seed/products";
import { seedFiles, seedFolders } from "../seed/files";
import { seedNotices } from "../seed/notices";
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function deriveInitials(name: string): string {
  return name.slice(0, 2);
}

class MemoryUserRepository implements UserRepository {
  readonly _data: User[];

  constructor(private readonly deps: { departments: DepartmentRepository }) {
    this._data = clone(seedUsers).map((u) => ({ isActive: u.isActive ?? true, ...u }));
  }

  private get data(): User[] {
    return this._data;
  }

  async list(): Promise<User[]> {
    return clone(this.data);
  }

  async findById(id: string): Promise<User | undefined> {
    const found = this.data.find((u) => u.id === id);
    return found ? clone(found) : undefined;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const normalized = email.trim().toLowerCase();
    const found = this.data.find((u) => u.email.toLowerCase() === normalized);
    return found ? clone(found) : undefined;
  }

  async create(input: CreateUserInput): Promise<User> {
    const department = await this.deps.departments.findById(input.departmentId);
    const user: User = {
      id: newId("u"),
      name: input.name,
      email: input.email,
      departmentId: input.departmentId,
      departmentName: department?.name ?? "",
      position: input.position,
      role: input.role,
      avatarTone: input.avatarTone ?? "default",
      initials: input.initials ?? deriveInitials(input.name),
      phone: input.phone,
      isActive: true
    };
    this.data.push(user);
    return clone(user);
  }

  async update(id: string, input: UpdateUserInput): Promise<User | undefined> {
    const idx = this.data.findIndex((u) => u.id === id);
    if (idx < 0) return undefined;
    const current = this.data[idx];
    const next: User = { ...current };
    if (input.name !== undefined) next.name = input.name;
    if (input.email !== undefined) next.email = input.email;
    if (input.position !== undefined) next.position = input.position;
    if (input.role !== undefined) next.role = input.role;
    if (input.phone !== undefined) next.phone = input.phone;
    if (input.avatarTone !== undefined) next.avatarTone = input.avatarTone;
    if (input.initials !== undefined) next.initials = input.initials;
    if (input.departmentId !== undefined) {
      next.departmentId = input.departmentId;
      const dept = await this.deps.departments.findById(input.departmentId);
      next.departmentName = dept?.name ?? "";
    }
    this.data[idx] = next;
    return clone(next);
  }

  async deactivate(id: string): Promise<User | undefined> {
    const idx = this.data.findIndex((u) => u.id === id);
    if (idx < 0) return undefined;
    this.data[idx] = { ...this.data[idx], isActive: false, presence: "off" };
    return clone(this.data[idx]);
  }
}

class MemoryDepartmentRepository implements DepartmentRepository {
  private readonly data: Department[];
  private getUsers: (() => User[]) | undefined;

  constructor() {
    this.data = clone(seedDepartments).map((d) => ({ isActive: true, ...d }));
  }

  setUserAccessor(accessor: () => User[]): void {
    this.getUsers = accessor;
  }

  async list(): Promise<Department[]> {
    return clone(this.data.filter((d) => d.isActive !== false));
  }

  async findById(id: string): Promise<Department | undefined> {
    const found = this.data.find((d) => d.id === id);
    return found ? clone(found) : undefined;
  }

  async create(input: CreateDepartmentInput): Promise<Department> {
    const dept: Department = {
      id: newId("d"),
      name: input.name,
      description: input.description,
      isActive: true
    };
    this.data.push(dept);
    return clone(dept);
  }

  async update(id: string, input: UpdateDepartmentInput): Promise<Department | undefined> {
    const idx = this.data.findIndex((d) => d.id === id);
    if (idx < 0) return undefined;
    const next = { ...this.data[idx] };
    if (input.name !== undefined) next.name = input.name;
    if (input.description !== undefined) next.description = input.description;
    this.data[idx] = next;
    return clone(next);
  }

  async delete(
    id: string
  ): Promise<{ ok: true } | { ok: false; reason: "not_found" | "in_use" }> {
    const idx = this.data.findIndex((d) => d.id === id);
    if (idx < 0) return { ok: false, reason: "not_found" };
    const users = this.getUsers?.() ?? [];
    if (users.some((u) => u.departmentId === id && u.isActive !== false)) {
      return { ok: false, reason: "in_use" };
    }
    this.data.splice(idx, 1);
    return { ok: true };
  }
}

class MemoryRoomRepository implements RoomRepository {
  private readonly data: Room[] = clone(seedRooms);
  async list(): Promise<Room[]> {
    return clone(this.data);
  }
  async findById(id: string): Promise<Room | undefined> {
    const found = this.data.find((r) => r.id === id);
    return found ? clone(found) : undefined;
  }
}

class MemoryMessageRepository implements MessageRepository {
  private readonly data: Record<string, ChatMessage[]> = clone(seedMessages);
  private readonly pinned: Record<string, { author: string; body: string }> =
    clone(seedPinnedMessages);

  async listByRoom(roomId: string): Promise<ChatMessage[]> {
    return clone(this.data[roomId] ?? []);
  }

  async append(roomId: string, message: ChatMessage): Promise<ChatMessage> {
    const list = this.data[roomId] ?? (this.data[roomId] = []);
    list.push(message);
    return clone(message);
  }

  async getPinned(roomId: string): Promise<{ author: string; body: string } | undefined> {
    const found = this.pinned[roomId];
    return found ? clone(found) : undefined;
  }
}

class MemoryProjectRepository implements ProjectRepository {
  readonly _data: Project[] = clone(seedProjects);

  async list(): Promise<Project[]> {
    return clone(this._data);
  }
  async findById(id: string): Promise<Project | undefined> {
    const found = this._data.find((p) => p.id === id);
    return found ? clone(found) : undefined;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const id = newId("p");
    const project: Project = {
      id,
      code: input.code ?? id.toUpperCase(),
      name: input.name,
      fullName: input.fullName ?? input.name,
      status: input.status ?? "ready",
      stageLabel: input.stageLabel ?? "준비 단계",
      department: input.department ?? "",
      ownerName: input.ownerName ?? "",
      startDate: input.startDate ?? "",
      dueDate: input.dueDate ?? "",
      progress: 0,
      taskCounts: { done: 0, inProgress: 0, pending: 0, total: 0 },
      delayedCount: 0,
      description: input.description ?? "",
      goals: input.goals ?? [],
      outputs: input.outputs ?? [],
      memberIds: input.memberIds ?? [],
      budget: input.budget,
      type: input.type,
      externalPartners: input.externalPartners,
      relatedProductIds: input.relatedProductIds,
      milestones: [],
      salesStatus: input.salesStatus
    };
    this._data.push(project);
    return clone(project);
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project | undefined> {
    const idx = this._data.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    const current = this._data[idx];
    const next: Project = { ...current };
    for (const key of Object.keys(input) as Array<keyof UpdateProjectInput>) {
      const value = input[key];
      if (value === undefined) continue;
      (next as unknown as Record<string, unknown>)[key] = value as unknown;
    }
    this._data[idx] = next;
    return clone(next);
  }

  async cancel(id: string): Promise<Project | undefined> {
    const idx = this._data.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    this._data[idx] = { ...this._data[idx], status: "cancelled" };
    return clone(this._data[idx]);
  }

  async addMember(id: string, userId: string): Promise<Project | undefined> {
    const idx = this._data.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    const current = this._data[idx];
    if (current.memberIds.includes(userId)) return clone(current);
    this._data[idx] = { ...current, memberIds: [...current.memberIds, userId] };
    return clone(this._data[idx]);
  }

  async removeMember(id: string, userId: string): Promise<Project | undefined> {
    const idx = this._data.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    const current = this._data[idx];
    if (!current.memberIds.includes(userId)) return clone(current);
    this._data[idx] = {
      ...current,
      memberIds: current.memberIds.filter((m) => m !== userId)
    };
    return clone(this._data[idx]);
  }
}

function recomputeProjectCounts(
  projects: Project[],
  tasks: TaskItem[],
  projectId: string
): void {
  const idx = projects.findIndex((p) => p.id === projectId);
  if (idx < 0) return;
  const projectTasks = tasks.filter((t) => t.projectId === projectId);
  const done = projectTasks.filter((t) => t.status === "done").length;
  const inProgress = projectTasks.filter(
    (t) => t.status === "in_progress" || t.status === "review"
  ).length;
  const pending = projectTasks.filter(
    (t) => t.status === "todo" || t.status === "on_hold"
  ).length;
  const total = projectTasks.length;
  const delayedCount = projectTasks.filter((t) => t.dueState === "late").length;
  projects[idx] = {
    ...projects[idx],
    taskCounts: { done, inProgress, pending, total },
    delayedCount
  };
}

class MemoryTaskRepository implements TaskRepository {
  readonly _data: TaskItem[] = clone(seedTasks);

  constructor(private readonly deps: { projects: MemoryProjectRepository }) {}

  async list(): Promise<TaskItem[]> {
    return clone(this._data);
  }
  async listByProject(projectId: string): Promise<TaskItem[]> {
    return clone(this._data.filter((t) => t.projectId === projectId));
  }
  async findById(id: string): Promise<TaskItem | undefined> {
    const found = this._data.find((t) => t.id === id);
    return found ? clone(found) : undefined;
  }

  async create(projectId: string, input: CreateTaskInput): Promise<TaskItem> {
    const id = newId("t");
    const task: TaskItem = {
      id,
      code: input.code ?? id.toUpperCase(),
      projectId,
      title: input.title,
      status: input.status ?? "todo",
      priority: input.priority ?? "normal",
      assigneeIds: input.assigneeIds ?? [],
      reviewerId: input.reviewerId,
      startDate: input.startDate,
      dueDate: input.dueDate,
      dueLabel: input.dueLabel ?? input.dueDate ?? "미정",
      progress: input.progress ?? 0
    };
    this._data.push(task);
    recomputeProjectCounts(this.deps.projects._data, this._data, projectId);
    return clone(task);
  }

  async update(id: string, input: UpdateTaskInput): Promise<TaskItem | undefined> {
    const idx = this._data.findIndex((t) => t.id === id);
    if (idx < 0) return undefined;
    const current = this._data[idx];
    const next: TaskItem = { ...current };
    for (const key of Object.keys(input) as Array<keyof UpdateTaskInput>) {
      const value = input[key];
      if (value === undefined) continue;
      (next as unknown as Record<string, unknown>)[key] = value as unknown;
    }
    this._data[idx] = next;
    recomputeProjectCounts(this.deps.projects._data, this._data, next.projectId);
    return clone(next);
  }

  async delete(id: string): Promise<boolean> {
    const idx = this._data.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    const [removed] = this._data.splice(idx, 1);
    recomputeProjectCounts(this.deps.projects._data, this._data, removed.projectId);
    return true;
  }
}

class MemoryProductRepository implements ProductRepository {
  private readonly data: Product[] = clone(seedProducts);
  async list(): Promise<Product[]> {
    return clone(this.data);
  }
  async findById(id: string): Promise<Product | undefined> {
    const found = this.data.find((p) => p.id === id);
    return found ? clone(found) : undefined;
  }
}

class MemoryFileRepository implements FileRepository {
  private readonly folders: FileFolder[] = clone(seedFolders);
  private readonly files: FileEntry[] = clone(seedFiles);
  async listFolders(): Promise<FileFolder[]> {
    return clone(this.folders);
  }
  async listFiles(): Promise<FileEntry[]> {
    return clone(this.files);
  }
  async findById(id: string): Promise<FileEntry | undefined> {
    const found = this.files.find((f) => f.id === id);
    return found ? clone(found) : undefined;
  }
}

class MemoryNoticeRepository implements NoticeRepository {
  private readonly data: Notice[] = clone(seedNotices).map((n) => ({ ...n, myConfirmed: false }));
  // userId -> set of confirmed notice ids. Seed data's `myConfirmed=true`
  // values are migrated into this map for `system` to preserve the demo state.
  private readonly confirmedByUser = new Map<string, Set<string>>();

  constructor() {
    const systemSet = new Set<string>();
    for (const original of seedNotices) {
      if (original.myConfirmed) systemSet.add(original.id);
    }
    if (systemSet.size > 0) this.confirmedByUser.set("__seed__", systemSet);
  }

  private withUserStatus(notice: Notice, userId?: string): Notice {
    if (!userId) return clone(notice);
    const confirmed = this.confirmedByUser.get(userId)?.has(notice.id) ?? false;
    return { ...clone(notice), myConfirmed: confirmed };
  }

  async list(userId?: string): Promise<Notice[]> {
    return this.data.map((n) => this.withUserStatus(n, userId));
  }

  async findById(id: string, userId?: string): Promise<Notice | undefined> {
    const found = this.data.find((n) => n.id === id);
    return found ? this.withUserStatus(found, userId) : undefined;
  }

  async markConfirmed(id: string, userId: string): Promise<Notice | undefined> {
    const found = this.data.find((n) => n.id === id);
    if (!found) return undefined;
    let userSet = this.confirmedByUser.get(userId);
    if (!userSet) {
      userSet = new Set<string>();
      this.confirmedByUser.set(userId, userSet);
    }
    if (!userSet.has(id)) {
      userSet.add(id);
      found.confirmedCount = Math.min(found.totalRecipients, found.confirmedCount + 1);
    }
    return this.withUserStatus(found, userId);
  }
}

export function createMemoryRepositories(): Repositories {
  const departments = new MemoryDepartmentRepository();
  const users = new MemoryUserRepository({ departments });
  // Departments need to peek at users to refuse delete when a department is
  // still in use. We wire a closure rather than introducing a circular import.
  departments.setUserAccessor(() => users._data);
  const projects = new MemoryProjectRepository();
  const tasks = new MemoryTaskRepository({ projects });
  return {
    users,
    departments,
    rooms: new MemoryRoomRepository(),
    messages: new MemoryMessageRepository(),
    projects,
    tasks,
    products: new MemoryProductRepository(),
    files: new MemoryFileRepository(),
    notices: new MemoryNoticeRepository()
  };
}
