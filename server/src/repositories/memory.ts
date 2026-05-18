import { randomBytes } from "crypto";
import type {
  ChatMessage,
  CreateDepartmentInput,
  CreateFileInput,
  CreateNoticeInput,
  CreateProductInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateUserInput,
  Department,
  FileEntry,
  FileFolder,
  FileKind,
  ListFilesFilter,
  Notice,
  NoticeReadStatus,
  NoticeReadStatusEntry,
  Product,
  Project,
  Room,
  TaskItem,
  UpdateDepartmentInput,
  UpdateProductInput,
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

  async append(
    roomId: string,
    message: ChatMessage,
    _opts?: { attachmentId?: string }
  ): Promise<ChatMessage> {
    // Memory mode: the route already embedded the attachment into the
    // message body (it looked it up via files.findById). Nothing extra here.
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

  async create(input: CreateProductInput): Promise<Product> {
    const today = new Date().toISOString().slice(0, 10);
    const product: Product = {
      id: newId("pr"),
      code: "",
      name: input.name,
      fullName: input.name,
      category: input.category ?? "",
      subCategory: "",
      description: input.description ?? "",
      features: input.features ?? [],
      applications: input.applications ?? [],
      cautions: input.cautions ?? [],
      salesStatus: input.salesStatus ?? "preparing",
      salesNote: input.salesNote ?? "",
      salesUpdatedAt: today,
      salesUpdatedBy: "",
      ownerId: input.ownerId ?? "",
      spec: [],
      lots: [],
      history: [],
      relatedProjectIds: [],
      documents: [],
      quarter: { totalKg: "", revenue: "", avgPrice: "", topClient: "", targetRatio: 0 }
    };
    this.data.unshift(product);
    return clone(product);
  }

  async update(id: string, input: UpdateProductInput): Promise<Product | undefined> {
    const target = this.data.find((p) => p.id === id);
    if (!target) return undefined;
    if (input.name !== undefined) {
      target.name = input.name;
      target.fullName = input.name;
    }
    if (input.category !== undefined) target.category = input.category;
    if (input.description !== undefined) target.description = input.description;
    if (input.features !== undefined) target.features = input.features;
    if (input.applications !== undefined) target.applications = input.applications;
    if (input.cautions !== undefined) target.cautions = input.cautions;
    if (input.salesStatus !== undefined) {
      target.salesStatus = input.salesStatus;
      target.salesUpdatedAt = new Date().toISOString().slice(0, 10);
    }
    if (input.salesNote !== undefined) target.salesNote = input.salesNote;
    if (input.ownerId !== undefined) target.ownerId = input.ownerId;
    return clone(target);
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.data.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.data.splice(idx, 1);
    return true;
  }
}

function deriveFileKind(filename: string, mime?: string): FileKind {
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

class MemoryFileRepository implements FileRepository {
  private readonly folders: FileFolder[] = clone(seedFolders);
  // Backfill `projectId` from seed `scope` strings ("P-2410") by lowercasing,
  // which matches the seedProjects.id convention. Done once at construction
  // so the live filter doesn't repeatedly re-derive.
  private readonly files: FileEntry[] = clone(seedFiles).map((f) => ({
    ...f,
    projectId: f.projectId ?? (f.scope?.startsWith("P-") ? f.scope.toLowerCase() : undefined)
  }));

  async listFolders(): Promise<FileFolder[]> {
    return clone(this.folders);
  }

  async listFiles(filter?: ListFilesFilter): Promise<FileEntry[]> {
    const out = this.files.filter((f) => {
      if (filter?.projectId && f.projectId !== filter.projectId) return false;
      if (filter?.productId && f.productId !== filter.productId) return false;
      if (filter?.taskId && f.taskId !== filter.taskId) return false;
      if (filter?.messageId && f.messageId !== filter.messageId) return false;
      if (filter?.uploaderId && f.uploaderId !== filter.uploaderId) return false;
      return true;
    });
    return clone(out);
  }

  async findById(id: string): Promise<FileEntry | undefined> {
    const found = this.files.find((f) => f.id === id);
    return found ? clone(found) : undefined;
  }

  async create(input: CreateFileInput, uploaderId: string): Promise<FileEntry> {
    const scope = input.projectId
      ? input.projectId.toUpperCase()
      : input.productId
      ? "제품정보"
      : input.taskId
      ? "업무"
      : "공유";
    const now = new Date();
    const stamp = `${String(now.getMonth() + 1).padStart(2, "0")}.${String(
      now.getDate()
    ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;
    const entry: FileEntry = {
      id: newId("f"),
      kind: deriveFileKind(input.fileName, input.fileType),
      name: input.fileName,
      scope,
      scopeTone: input.projectId ? "blue" : "default",
      size: formatBytes(input.fileSize),
      uploaderId,
      uploadedAt: stamp,
      projectId: input.projectId,
      productId: input.productId,
      taskId: input.taskId,
      messageId: input.messageId
    };
    this.files.unshift(entry);
    this.storage.set(entry.id, {
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      fileType: input.fileType
    });
    return clone(entry);
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.files.findIndex((f) => f.id === id);
    if (idx === -1) return false;
    this.files.splice(idx, 1);
    this.storage.delete(id);
    return true;
  }

  // Storage path for newly-uploaded files. Seed files lack on-disk content,
  // so download for them returns 404. Real uploads go through `create`,
  // which records their path here for the download route to find.
  private readonly storage = new Map<string, { fileName: string; fileUrl: string; fileType?: string }>();

  async findStorage(
    id: string
  ): Promise<{ fileName: string; fileUrl: string; fileType?: string } | undefined> {
    return this.storage.get(id);
  }
}

class MemoryNoticeRepository implements NoticeRepository {
  private readonly data: Notice[] = clone(seedNotices).map((n) => ({ ...n, myConfirmed: false }));
  // userId -> (noticeId -> confirmedAt ISO). We need the timestamp for
  // `getReadStatus`; the boolean `myConfirmed` falls out of map.has().
  private readonly confirmedByUser = new Map<string, Map<string, string>>();
  // Wired by createMemoryRepositories so we can iterate active users for
  // recipient counts and the read-status payload.
  private getActiveUsers: () => User[] = () => [];

  constructor() {
    // Seed `myConfirmed=true` values get carried into a synthetic `__seed__`
    // user so the demo's "이미 확인됨" badge keeps showing on /notices.
    const systemMap = new Map<string, string>();
    const stamp = new Date().toISOString();
    for (const original of seedNotices) {
      if (original.myConfirmed) systemMap.set(original.id, stamp);
    }
    if (systemMap.size > 0) this.confirmedByUser.set("__seed__", systemMap);
  }

  setUserAccessor(getActive: () => User[]): void {
    this.getActiveUsers = getActive;
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

  async create(
    input: CreateNoticeInput,
    author: { id: string; departmentName: string }
  ): Promise<Notice> {
    const isMandatory = input.isMandatory ?? true;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const notice: Notice = {
      id: newId("n"),
      title: input.title,
      body: input.body,
      authorTeam: author.departmentName,
      createdAt: `${yyyy}.${mm}.${dd}`,
      isMandatory,
      totalRecipients: this.getActiveUsers().filter((u) => u.isActive !== false).length,
      confirmedCount: 0,
      myConfirmed: false,
      tone: isMandatory ? "red" : "green"
    };
    this.data.unshift(notice);
    return clone(notice);
  }

  async markConfirmed(id: string, userId: string): Promise<Notice | undefined> {
    const found = this.data.find((n) => n.id === id);
    if (!found) return undefined;
    let userMap = this.confirmedByUser.get(userId);
    if (!userMap) {
      userMap = new Map<string, string>();
      this.confirmedByUser.set(userId, userMap);
    }
    if (!userMap.has(id)) {
      userMap.set(id, new Date().toISOString());
      found.confirmedCount = Math.min(found.totalRecipients, found.confirmedCount + 1);
    }
    return this.withUserStatus(found, userId);
  }

  async getReadStatus(id: string): Promise<NoticeReadStatus | undefined> {
    const notice = this.data.find((n) => n.id === id);
    if (!notice) return undefined;
    const active = this.getActiveUsers().filter((u) => u.isActive !== false);
    const confirmed: NoticeReadStatusEntry[] = [];
    const unconfirmed: NoticeReadStatusEntry[] = [];
    for (const u of active) {
      const at = this.confirmedByUser.get(u.id)?.get(id);
      const base = {
        userId: u.id,
        name: u.name,
        departmentName: u.departmentName
      };
      if (at) confirmed.push({ ...base, confirmedAt: at });
      else unconfirmed.push(base);
    }
    return {
      noticeId: id,
      totalRecipients: active.length,
      confirmed,
      unconfirmed
    };
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
  const notices = new MemoryNoticeRepository();
  // Read-status + new-notice recipient counts need the live active-user list.
  notices.setUserAccessor(() => users._data);
  return {
    users,
    departments,
    rooms: new MemoryRoomRepository(),
    messages: new MemoryMessageRepository(),
    projects,
    tasks,
    products: new MemoryProductRepository(),
    files: new MemoryFileRepository(),
    notices
  };
}
