import { createHash, randomBytes } from "crypto";
import type {
  AuditEntry,
  ChatMessage,
  CreateAuditInput,
  CreateDecisionInput,
  CreateDepartmentInput,
  CreateFileInput,
  CreateNoticeInput,
  PinnedMessageRef,
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
  FileKind,
  ListFilesFilter,
  Notice,
  NoticeReadStatus,
  NoticeReadStatusEntry,
  Notification,
  NotificationSettings,
  Product,
  ProductLot,
  ProductSpec,
  Project,
  Room,
  SalesStatusEvent,
  CreateProductLotInput,
  CreateProductSpecInput,
  UpdateProductLotInput,
  UpdateProductSpecInput,
  TaskItem,
  UpdateDecisionInput,
  UpdateDepartmentInput,
  UpdateNotificationSettingsInput,
  UpdateProductInput,
  UpdateProjectInput,
  UpdateRoomInput,
  UpdateTaskInput,
  UpdateUserInput,
  User
} from "@hanmir/shared";
import { hashPassword, seedPasswordHash, verifyPassword } from "../auth/password";
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
  AuditRepository,
  CreateNotificationInput,
  CreatePushSubscriptionInput,
  DecisionRepository,
  DepartmentRepository,
  FileRepository,
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

// Refresh token TTL — paired with the cookie Max-Age in routes/auth.ts.
// Single source of truth lives here so a future config switch can change
// both in one place.
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

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
  // Per-user bcrypt hashes — kept off the User DTO so the public shape never
  // carries credentials. Every seed user starts with the pre-computed seed
  // hash; newly-created users either get an explicit hash (from input.password)
  // or the same seed hash as a temporary placeholder.
  private readonly passwords = new Map<string, string>();

  constructor(private readonly deps: { departments: DepartmentRepository }) {
    this._data = clone(seedUsers).map((u) => ({
      isActive: u.isActive ?? true,
      // Memory mode seeds start with mustChangePassword=false for dev
      // convenience (otherwise every restart forces the password-change
      // flow). PG mode keeps it true via migration 007.
      mustChangePassword: false,
      ...u
    }));
    for (const u of this._data) {
      this.passwords.set(u.id, seedPasswordHash);
    }
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
      isActive: true,
      // Admin-issued accounts must rotate their password on first login.
      // Users created with an explicit password are trusted (e.g. seeded
      // via invitation flow that already captured their input).
      mustChangePassword: !input.password
    };
    this.data.push(user);
    // New users get a hashed password — explicit input.password takes
    // precedence, else fall back to the same seed hash so they can log in
    // with DEFAULT_PASSWORD until they change it.
    this.passwords.set(
      user.id,
      input.password ? hashPassword(input.password) : seedPasswordHash
    );
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

  async verifyPassword(userId: string, plain: string): Promise<boolean> {
    const hash = this.passwords.get(userId);
    return hash ? verifyPassword(plain, hash) : false;
  }

  async setPassword(userId: string, plain: string): Promise<void> {
    this.passwords.set(userId, hashPassword(plain));
    // Clear the must-change flag the moment a user picks a real password.
    const idx = this.data.findIndex((u) => u.id === userId);
    if (idx >= 0) {
      this.data[idx] = { ...this.data[idx], mustChangePassword: false };
    }
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
  private readonly data: Room[];
  // Phase 4 G-1 — per-user mute state. Set<roomId> per userId. We carry
  // over the seed's static `muted: true` onto u-kim-minjun (the default
  // dev login) so the demo data still looks like before, then drop the
  // static field so it can't shadow the dynamic per-user state.
  private readonly mutedByUser = new Map<string, Set<string>>();
  // Wired by createMemoryRepositories — lets list/findById call into the
  // message repo for unread count + pinned message lookup without a
  // circular import.
  private messages?: MemoryMessageRepository;

  constructor() {
    const seeded = clone(seedRooms);
    const kimMutes = new Set<string>();
    for (const r of seeded) {
      if (r.muted) kimMutes.add(r.id);
      delete (r as { muted?: boolean }).muted;
    }
    if (kimMutes.size > 0) this.mutedByUser.set("u-kim-minjun", kimMutes);
    this.data = seeded;
  }

  setMessageAccessor(messages: MemoryMessageRepository): void {
    this.messages = messages;
  }

  private decorate(room: Room, userId?: string): Room {
    const out = clone(room);
    if (this.messages) {
      out.unread = userId ? this.messages.unreadCount(room.id, userId) : 0;
      const pin = this.messages.getPinnedId(room.id);
      out.pinnedMessageId = pin;
    }
    // Per-user mute overlay. Without a userId we leave muted undefined
    // (server-side admin tools etc.) instead of guessing.
    out.muted = userId ? this.mutedByUser.get(userId)?.has(room.id) ?? false : undefined;
    return out;
  }

  async list(userId?: string): Promise<Room[]> {
    return this.data.map((r) => this.decorate(r, userId));
  }

  async findById(id: string, userId?: string): Promise<Room | undefined> {
    const found = this.data.find((r) => r.id === id);
    return found ? this.decorate(found, userId) : undefined;
  }

  async create(input: CreateRoomInput, createdBy: { id: string }): Promise<Room> {
    const type = input.type ?? "group";
    // Creator is always a member with owner role. Other ids get plain
    // member role. Dedupe so passing yourself in memberIds is fine.
    const memberSet = new Set<string>([createdBy.id, ...(input.memberIds ?? [])]);
    const room: Room = {
      id: newId("r"),
      name: input.name,
      type,
      description: input.description,
      projectId: input.projectId,
      members: Array.from(memberSet).map((uid) => ({
        userId: uid,
        isOwner: uid === createdBy.id || undefined
      })),
      unread: 0,
      lastMessageAt: "",
      lastMessagePreview: ""
    };
    this.data.unshift(room);
    return this.decorate(room, createdBy.id);
  }

  async update(id: string, input: UpdateRoomInput): Promise<Room | undefined> {
    const idx = this.data.findIndex((r) => r.id === id);
    if (idx < 0) return undefined;
    const next: Room = { ...this.data[idx] };
    if (input.name !== undefined) next.name = input.name;
    if (input.description !== undefined) next.description = input.description;
    this.data[idx] = next;
    return this.decorate(next);
  }

  async findOrCreateDirect(userIdA: string, userIdB: string): Promise<Room> {
    // Direct rooms have exactly two members. Order-independent search.
    const a = userIdA;
    const b = userIdB;
    const existing = this.data.find(
      (r) =>
        r.type === "direct" &&
        r.members.length === 2 &&
        r.members.some((m) => m.userId === a) &&
        r.members.some((m) => m.userId === b)
    );
    if (existing) return this.decorate(existing, a);
    return this.create(
      {
        // Direct-room name is just a placeholder; the UI renders the
        // counterparty's name based on the member list.
        name: "1:1 대화",
        type: "direct",
        memberIds: [b]
      },
      { id: a }
    );
  }

  async addMember(id: string, userId: string): Promise<Room | undefined> {
    const idx = this.data.findIndex((r) => r.id === id);
    if (idx < 0) return undefined;
    const current = this.data[idx];
    if (current.members.some((m) => m.userId === userId)) {
      return this.decorate(current);
    }
    this.data[idx] = {
      ...current,
      members: [...current.members, { userId }]
    };
    return this.decorate(this.data[idx]);
  }

  async removeMember(id: string, userId: string): Promise<Room | undefined> {
    const idx = this.data.findIndex((r) => r.id === id);
    if (idx < 0) return undefined;
    const current = this.data[idx];
    this.data[idx] = {
      ...current,
      members: current.members.filter((m) => m.userId !== userId)
    };
    // Also drop their mute state so it doesn't linger if they get re-added.
    this.mutedByUser.get(userId)?.delete(id);
    return this.decorate(this.data[idx]);
  }

  async setMute(id: string, userId: string, muted: boolean): Promise<Room | undefined> {
    const room = this.data.find((r) => r.id === id);
    if (!room) return undefined;
    let set = this.mutedByUser.get(userId);
    if (!set) {
      set = new Set<string>();
      this.mutedByUser.set(userId, set);
    }
    if (muted) set.add(id);
    else set.delete(id);
    return this.decorate(room, userId);
  }

  async leave(
    id: string,
    userId: string
  ): Promise<{ ok: true; archived: boolean } | { ok: false }> {
    const idx = this.data.findIndex((r) => r.id === id);
    if (idx < 0) return { ok: false };
    const current = this.data[idx];
    if (!current.members.some((m) => m.userId === userId)) {
      // Not a member — treat as success (idempotent leave).
      return { ok: true, archived: false };
    }
    const remaining = current.members.filter((m) => m.userId !== userId);
    this.mutedByUser.get(userId)?.delete(id);
    if (remaining.length === 0) {
      // Last member — archive (memory mode just removes the room from
      // the active list since there's no is_active column on the DTO).
      this.data.splice(idx, 1);
      return { ok: true, archived: true };
    }
    this.data[idx] = { ...current, members: remaining };
    return { ok: true, archived: false };
  }
}

class MemoryMessageRepository implements MessageRepository {
  private readonly data: Record<string, ChatMessage[]> = clone(seedMessages);
  // userId -> roomId -> lastReadMessageId
  private readonly lastRead = new Map<string, Map<string, string>>();
  // roomId -> messageId of the pinned message. Seeded so the demo chat
  // banner still has something to show on r-p2410.
  private readonly pinnedByRoom = new Map<string, string>();

  constructor() {
    // Carry the seed "pinned" demo content over to the new structure by
    // matching body text against the seed messages of each room.
    for (const [roomId, seed] of Object.entries(seedPinnedMessages)) {
      const list = this.data[roomId] ?? [];
      const hit = list.find(
        (m) => m.body.trim() === seed.body.trim() && m.authorName === seed.author
      );
      if (hit) this.pinnedByRoom.set(roomId, hit.id);
    }
  }

  unreadCount(roomId: string, userId: string): number {
    const list = this.data[roomId];
    if (!list || list.length === 0) return 0;
    const lastId = this.lastRead.get(userId)?.get(roomId);
    if (!lastId) {
      // Never marked read: every message not authored by this user counts.
      return list.filter((m) => m.authorId !== userId).length;
    }
    const idx = list.findIndex((m) => m.id === lastId);
    if (idx === -1) return list.filter((m) => m.authorId !== userId).length;
    return list.slice(idx + 1).filter((m) => m.authorId !== userId).length;
  }

  getPinnedId(roomId: string): string | undefined {
    return this.pinnedByRoom.get(roomId);
  }

  // Synchronous helper used by accessors that need a quick message→room
  // lookup without going through the async repo API (which would force
  // every caller to be async). Memory-mode only.
  findRoomIdByMessageIdSync(messageId: string): string | undefined {
    for (const [roomId, list] of Object.entries(this.data)) {
      if (list.some((m) => m.id === messageId)) return roomId;
    }
    return undefined;
  }

  async listByRoom(roomId: string): Promise<ChatMessage[]> {
    return (this.data[roomId] ?? []).map(maskIfDeleted);
  }

  async findById(messageId: string): Promise<ChatMessage | undefined> {
    // O(N) scan across all rooms is fine at MVP volume; PG adapter uses a
    // proper indexed lookup.
    for (const list of Object.values(this.data)) {
      const hit = list.find((m) => m.id === messageId);
      if (hit) return maskIfDeleted(hit);
    }
    return undefined;
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

  async updateBody(messageId: string, body: string): Promise<ChatMessage | undefined> {
    for (const list of Object.values(this.data)) {
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) continue;
      list[idx] = {
        ...list[idx],
        body,
        editedAt: new Date().toISOString()
      };
      // If this was the pinned message, unpin to avoid stale preview.
      // Caller can re-pin if the edit is what they want highlighted.
      const pinnedRoomId = Object.keys(this.data).find((rid) => rid === list[idx].roomId);
      if (pinnedRoomId && this.pinnedByRoom.get(pinnedRoomId) === messageId) {
        // Body change is reflected since getPinned re-reads from data.
      }
      return clone(list[idx]);
    }
    return undefined;
  }

  async softDelete(messageId: string): Promise<boolean> {
    for (const list of Object.values(this.data)) {
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) continue;
      list[idx] = { ...list[idx], isDeleted: true };
      // Drop pin if this was the pinned message — a tombstone in the
      // pinned banner is worse than no banner.
      if (this.pinnedByRoom.get(list[idx].roomId) === messageId) {
        this.pinnedByRoom.delete(list[idx].roomId);
      }
      return true;
    }
    return false;
  }

  async search(opts: { q: string; roomIds: string[]; limit?: number }): Promise<ChatMessage[]> {
    const needle = opts.q.trim().toLowerCase();
    if (!needle) return [];
    const allowed = new Set(opts.roomIds);
    const limit = opts.limit ?? 50;
    const matches: ChatMessage[] = [];
    for (const [roomId, list] of Object.entries(this.data)) {
      if (!allowed.has(roomId)) continue;
      for (const m of list) {
        if (m.isDeleted) continue;
        if (m.body.toLowerCase().includes(needle)) matches.push(m);
      }
    }
    // Most recent first. createdAt is an ISO string from append, so
    // lexicographic compare is chronological.
    matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matches.slice(0, limit).map((m) => clone(m));
  }

  async markRead(
    roomId: string,
    userId: string,
    lastMessageId: string
  ): Promise<void> {
    let userMap = this.lastRead.get(userId);
    if (!userMap) {
      userMap = new Map<string, string>();
      this.lastRead.set(userId, userMap);
    }
    userMap.set(roomId, lastMessageId);
  }

  async pin(
    roomId: string,
    messageId: string
  ): Promise<"ok" | "room_not_found" | "message_not_in_room"> {
    const list = this.data[roomId];
    if (!list) return "room_not_found";
    if (!list.some((m) => m.id === messageId)) return "message_not_in_room";
    this.pinnedByRoom.set(roomId, messageId);
    return "ok";
  }

  async unpin(roomId: string): Promise<"ok" | "room_not_found"> {
    // Memory: we don't track room existence here — defer to the route, which
    // already checks the rooms repo before calling unpin. Just clear.
    this.pinnedByRoom.delete(roomId);
    return "ok";
  }

  async getPinned(roomId: string): Promise<PinnedMessageRef | undefined> {
    const id = this.pinnedByRoom.get(roomId);
    if (!id) return undefined;
    const msg = this.data[roomId]?.find((m) => m.id === id);
    // Drop the pin if the underlying message is gone or tombstoned —
    // softDelete already clears the pin map, but defense in depth.
    if (!msg || msg.isDeleted) return undefined;
    return {
      id: msg.id,
      authorName: msg.authorName,
      body: msg.body,
      createdAt: msg.createdAt
    };
  }
}

// Phase 2 E-1 — apply the same body mask as the PG adapter so soft-deleted
// rows never expose their original content over the API, regardless of
// which adapter is active.
function maskIfDeleted(message: ChatMessage): ChatMessage {
  if (!message.isDeleted) return clone(message);
  const masked = clone(message);
  masked.body = "삭제된 메시지입니다";
  delete masked.attachment;
  return masked;
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
    // 부속 데이터도 정리
    this.specs = this.specs.filter((s) => s.productId !== id);
    this.lots = this.lots.filter((l) => l.productId !== id);
    this.salesEvents = this.salesEvents.filter((e) => e.productId !== id);
    return true;
  }

  // Phase 7 J-1 — product_specs / product_lots / sales_status_events
  // in-memory stores. 시드는 비어있음 (seedProducts.spec/lots/history는
  // DTO 응답에 같이 들어가지만 별도 mock으로 보존).
  private specs: ProductSpec[] = [];
  private lots: ProductLot[] = [];
  private salesEvents: SalesStatusEvent[] = [];

  async listSpecs(productId: string): Promise<ProductSpec[]> {
    return this.specs
      .filter((s) => s.productId === productId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => clone(s));
  }

  async createSpec(productId: string, input: CreateProductSpecInput): Promise<ProductSpec> {
    // (productId, key) UNIQUE — 중복이면 기존 row를 덮어쓰는 게 자연스러움
    const existing = this.specs.find((s) => s.productId === productId && s.key === input.key);
    if (existing) {
      existing.value = input.value;
      existing.sortOrder = input.sortOrder ?? existing.sortOrder;
      return clone(existing);
    }
    const spec: ProductSpec = {
      id: newId("spec"),
      productId,
      key: input.key,
      value: input.value,
      sortOrder: input.sortOrder ?? this.specs.filter((s) => s.productId === productId).length
    };
    this.specs.push(spec);
    return clone(spec);
  }

  async updateSpec(
    productId: string,
    specId: string,
    input: UpdateProductSpecInput
  ): Promise<ProductSpec | undefined> {
    const target = this.specs.find((s) => s.id === specId && s.productId === productId);
    if (!target) return undefined;
    if (input.key !== undefined) target.key = input.key;
    if (input.value !== undefined) target.value = input.value;
    if (input.sortOrder !== undefined) target.sortOrder = input.sortOrder;
    return clone(target);
  }

  async deleteSpec(productId: string, specId: string): Promise<boolean> {
    const idx = this.specs.findIndex((s) => s.id === specId && s.productId === productId);
    if (idx < 0) return false;
    this.specs.splice(idx, 1);
    return true;
  }

  async listLots(productId: string): Promise<ProductLot[]> {
    return this.lots
      .filter((l) => l.productId === productId)
      .sort((a, b) => (b.producedAt ?? "").localeCompare(a.producedAt ?? ""))
      .map((l) => clone(l));
  }

  async createLot(productId: string, input: CreateProductLotInput): Promise<ProductLot> {
    if (this.lots.some((l) => l.productId === productId && l.number === input.number)) {
      throw new Error("duplicate_lot_number");
    }
    const lot: ProductLot = {
      id: newId("lot"),
      productId,
      number: input.number,
      producedAt: input.producedAt,
      quantity: input.quantity,
      verdict: input.verdict,
      testedAt: input.testedAt,
      note: input.note,
      createdAt: new Date().toISOString()
    };
    this.lots.unshift(lot);
    return clone(lot);
  }

  async updateLot(
    productId: string,
    lotId: string,
    input: UpdateProductLotInput
  ): Promise<ProductLot | undefined> {
    const target = this.lots.find((l) => l.id === lotId && l.productId === productId);
    if (!target) return undefined;
    if (input.number !== undefined) target.number = input.number;
    if (input.producedAt !== undefined) target.producedAt = input.producedAt;
    if (input.quantity !== undefined) target.quantity = input.quantity;
    if (input.verdict !== undefined) target.verdict = input.verdict;
    if (input.testedAt !== undefined) target.testedAt = input.testedAt;
    if (input.note !== undefined) target.note = input.note;
    return clone(target);
  }

  async deleteLot(productId: string, lotId: string): Promise<boolean> {
    const idx = this.lots.findIndex((l) => l.id === lotId && l.productId === productId);
    if (idx < 0) return false;
    this.lots.splice(idx, 1);
    return true;
  }

  async listSalesEvents(productId: string): Promise<SalesStatusEvent[]> {
    return this.salesEvents
      .filter((e) => e.productId === productId)
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
      .map((e) => clone(e));
  }

  async appendSalesEvent(input: {
    productId: string;
    fromStatus?: string;
    toStatus: string;
    reason?: string;
    changedBy: { id: string };
  }): Promise<SalesStatusEvent> {
    const event: SalesStatusEvent = {
      id: newId("se"),
      productId: input.productId,
      fromStatus: input.fromStatus as SalesStatusEvent["fromStatus"],
      toStatus: input.toStatus as SalesStatusEvent["toStatus"],
      reason: input.reason,
      changedById: input.changedBy.id,
      changedByName: "",
      changedAt: new Date().toISOString()
    };
    this.salesEvents.unshift(event);
    return clone(event);
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

interface AuditRow extends CreateAuditInput {
  id: string;
  createdAt: string;
}

class MemoryAuditRepository implements AuditRepository {
  private readonly data: AuditRow[] = [];
  private readonly maxRows = 500;

  async record(input: CreateAuditInput): Promise<void> {
    const row: AuditRow = {
      id: newId("au"),
      createdAt: new Date().toISOString(),
      level: input.level ?? "info",
      ...input
    };
    this.data.unshift(row);
    if (this.data.length > this.maxRows) this.data.length = this.maxRows;
  }

  async list(opts?: { limit?: number; action?: string; actorUserId?: string }): Promise<AuditEntry[]> {
    const limit = opts?.limit ?? 50;
    let rows = this.data.slice();
    if (opts?.action) rows = rows.filter((r) => r.action === opts.action);
    if (opts?.actorUserId) rows = rows.filter((r) => r.actorUserId === opts.actorUserId);
    rows = rows.slice(0, limit);
    return rows.map((r) => formatAuditEntry(r));
  }
}

function formatAuditEntry(r: AuditRow): AuditEntry {
  const actor = r.actorName ?? "시스템";
  const target = r.targetLabel ?? r.targetId ?? r.targetType ?? "";
  return {
    id: r.id,
    title: actorLabel(r.action, actor),
    meta: target ? `${target}` : "",
    time: relativeTime(r.createdAt),
    level: (r.level ?? "info") as AuditEntry["level"]
  };
}

function actorLabel(action: string, actor: string): string {
  return `${actor} · ${action}`;
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

interface DecisionRow {
  id: string;
  projectId: string;
  title: string;
  content: string;
  decidedById: string;
  decisionDate: string;
  sourceMessageId?: string;
  sourceRoomId?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

class MemoryDecisionRepository implements DecisionRepository {
  private readonly rows: DecisionRow[] = [];
  // userId → set of decisionIds the user has confirmed, with timestamps.
  // Mirrors NoticeRepository's pattern.
  private readonly confirmedByUser = new Map<string, Map<string, string>>();
  private getActiveUsers: () => User[] = () => [];
  // Closures so decoration can look up author / source message info
  // without cross-cutting repo coupling.
  private getUserById: (id: string) => User | undefined = () => undefined;
  private getMessageRoomId: (messageId: string) => string | undefined = () => undefined;

  setAccessors(opts: {
    getActiveUsers: () => User[];
    getUserById: (id: string) => User | undefined;
    getMessageRoomId: (id: string) => string | undefined;
  }): void {
    this.getActiveUsers = opts.getActiveUsers;
    this.getUserById = opts.getUserById;
    this.getMessageRoomId = opts.getMessageRoomId;
  }

  private decorate(row: DecisionRow, userId?: string): Decision {
    const decidedBy = this.getUserById(row.decidedById);
    const role =
      decidedBy?.position && decidedBy?.departmentName
        ? `${decidedBy.position} · ${decidedBy.departmentName}`
        : decidedBy?.position;
    const total = this.getActiveUsers().filter((u) => u.isActive !== false).length;
    const confirmed = this.countConfirmed(row.id);
    const isDeleted = row.isDeleted;
    return {
      id: row.id,
      projectId: row.projectId,
      title: isDeleted ? "삭제된 결정사항입니다" : row.title,
      content: isDeleted ? "삭제된 결정사항입니다" : row.content,
      decidedById: row.decidedById,
      decidedByName: decidedBy?.name ?? "",
      decidedByRole: role,
      decisionDate: row.decisionDate,
      sourceMessageId: row.sourceMessageId,
      sourceRoomId: row.sourceRoomId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      totalRecipients: total,
      confirmedCount: confirmed,
      myConfirmed: userId
        ? this.confirmedByUser.get(userId)?.has(row.id) ?? false
        : false,
      isDeleted: isDeleted || undefined
    };
  }

  private countConfirmed(decisionId: string): number {
    let n = 0;
    for (const userMap of this.confirmedByUser.values()) {
      if (userMap.has(decisionId)) n++;
    }
    return n;
  }

  async listByProject(projectId: string, userId?: string): Promise<Decision[]> {
    return this.rows
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => b.decisionDate.localeCompare(a.decisionDate))
      .map((r) => this.decorate(r, userId));
  }

  async findById(id: string, userId?: string): Promise<Decision | undefined> {
    const row = this.rows.find((r) => r.id === id);
    return row ? this.decorate(row, userId) : undefined;
  }

  async create(
    projectId: string,
    input: CreateDecisionInput,
    decidedBy: { id: string }
  ): Promise<Decision> {
    const now = new Date().toISOString();
    const sourceMessageId = input.sourceMessageId;
    const sourceRoomId = sourceMessageId
      ? this.getMessageRoomId(sourceMessageId)
      : undefined;
    const row: DecisionRow = {
      id: newId("dec"),
      projectId,
      title: input.title,
      content: input.content,
      decidedById: decidedBy.id,
      decisionDate: input.decisionDate ?? now.slice(0, 10),
      sourceMessageId,
      sourceRoomId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false
    };
    this.rows.unshift(row);
    return this.decorate(row, decidedBy.id);
  }

  async update(id: string, input: UpdateDecisionInput): Promise<Decision | undefined> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx < 0) return undefined;
    const current = this.rows[idx];
    if (current.isDeleted) return this.decorate(current);
    const next: DecisionRow = {
      ...current,
      title: input.title ?? current.title,
      content: input.content ?? current.content,
      decisionDate: input.decisionDate ?? current.decisionDate,
      updatedAt: new Date().toISOString()
    };
    this.rows[idx] = next;
    return this.decorate(next);
  }

  async softDelete(id: string): Promise<boolean> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx < 0 || this.rows[idx].isDeleted) return idx >= 0;
    this.rows[idx] = {
      ...this.rows[idx],
      isDeleted: true,
      updatedAt: new Date().toISOString()
    };
    return true;
  }

  async markConfirmed(id: string, userId: string): Promise<Decision | undefined> {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.isDeleted) return undefined;
    let userMap = this.confirmedByUser.get(userId);
    if (!userMap) {
      userMap = new Map<string, string>();
      this.confirmedByUser.set(userId, userMap);
    }
    if (!userMap.has(id)) {
      userMap.set(id, new Date().toISOString());
    }
    return this.decorate(row, userId);
  }

  async getReadStatus(id: string): Promise<DecisionReadStatus | undefined> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return undefined;
    const active = this.getActiveUsers().filter((u) => u.isActive !== false);
    const confirmed: DecisionReadStatusEntry[] = [];
    const unconfirmed: DecisionReadStatusEntry[] = [];
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
      decisionId: id,
      totalRecipients: active.length,
      confirmed,
      unconfirmed
    };
  }
}

// Phase 6 I-1 — in-memory notification store.
class MemoryNotificationRepository implements NotificationRepository {
  // Insertion order = chronological. We unshift so the newest is at index 0,
  // which makes listForUser slice cheap.
  private readonly rows: Notification[] = [];
  // userId → settings. Lazily created on first access via getSettings.
  private readonly settings = new Map<string, NotificationSettings>();

  async create(input: CreateNotificationInput): Promise<Notification> {
    const n: Notification = {
      id: newId("notif"),
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link: input.link,
      payload: input.payload,
      readAt: undefined,
      createdAt: new Date().toISOString()
    };
    this.rows.unshift(n);
    return clone(n);
  }

  async createMany(
    userIds: string[],
    input: Omit<CreateNotificationInput, "userId">
  ): Promise<Notification[]> {
    if (userIds.length === 0) return [];
    const out: Notification[] = [];
    for (const userId of userIds) {
      const n = await this.create({ ...input, userId });
      out.push(n);
    }
    return out;
  }

  async listForUser(
    userId: string,
    opts?: { unreadOnly?: boolean; limit?: number }
  ): Promise<Notification[]> {
    const limit = opts?.limit ?? 20;
    let list = this.rows.filter((n) => n.userId === userId);
    if (opts?.unreadOnly) list = list.filter((n) => !n.readAt);
    return list.slice(0, limit).map((n) => clone(n));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.rows.reduce(
      (acc, n) => (n.userId === userId && !n.readAt ? acc + 1 : acc),
      0
    );
  }

  async markRead(id: string, userId: string): Promise<Notification | undefined> {
    const idx = this.rows.findIndex((n) => n.id === id && n.userId === userId);
    if (idx < 0) return undefined;
    if (this.rows[idx].readAt) return clone(this.rows[idx]);
    this.rows[idx] = { ...this.rows[idx], readAt: new Date().toISOString() };
    return clone(this.rows[idx]);
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    let count = 0;
    const now = new Date().toISOString();
    for (let i = 0; i < this.rows.length; i++) {
      if (this.rows[i].userId === userId && !this.rows[i].readAt) {
        this.rows[i] = { ...this.rows[i], readAt: now };
        count++;
      }
    }
    return { count };
  }

  async getSettings(userId: string): Promise<NotificationSettings> {
    let s = this.settings.get(userId);
    if (!s) {
      s = {
        userId,
        allEnabled: true,
        perRoom: {},
        perProject: {},
        webPushEnabled: false,
        browserEnabled: true
      };
      this.settings.set(userId, s);
    }
    return clone(s);
  }

  async updateSettings(
    userId: string,
    input: UpdateNotificationSettingsInput
  ): Promise<NotificationSettings> {
    const current = await this.getSettings(userId);
    const next: NotificationSettings = {
      ...current,
      ...(input.allEnabled !== undefined && { allEnabled: input.allEnabled }),
      ...(input.perRoom !== undefined && { perRoom: input.perRoom }),
      ...(input.perProject !== undefined && { perProject: input.perProject }),
      ...(input.webPushEnabled !== undefined && { webPushEnabled: input.webPushEnabled }),
      ...(input.browserEnabled !== undefined && { browserEnabled: input.browserEnabled })
    };
    this.settings.set(userId, next);
    return clone(next);
  }
}

// Phase 6 I-5 — in-memory push subscription store.
class MemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly rows: PushSubscriptionRecord[] = [];

  async upsert(input: CreatePushSubscriptionInput): Promise<PushSubscriptionRecord> {
    const existing = this.rows.find(
      (r) => r.userId === input.userId && r.endpoint === input.endpoint
    );
    if (existing) {
      // Update keys in case they rotated.
      existing.p256dh = input.p256dh;
      existing.auth = input.auth;
      existing.userAgent = input.userAgent;
      return clone(existing);
    }
    const rec: PushSubscriptionRecord = {
      id: newId("psub"),
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
      createdAt: new Date().toISOString()
    };
    this.rows.push(rec);
    return clone(rec);
  }

  async listForUser(userId: string): Promise<PushSubscriptionRecord[]> {
    return this.rows.filter((r) => r.userId === userId).map((r) => clone(r));
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    this.rows.splice(idx, 1);
    return true;
  }

  async deleteByEndpoint(userId: string, endpoint: string): Promise<boolean> {
    const idx = this.rows.findIndex((r) => r.userId === userId && r.endpoint === endpoint);
    if (idx < 0) return false;
    this.rows.splice(idx, 1);
    return true;
  }
}

interface RefreshRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
}

class MemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly rows: RefreshRow[] = [];

  async issue(
    userId: string,
    ctx?: { userAgent?: string; ip?: string }
  ): Promise<IssuedRefreshToken> {
    // 32 random bytes → 64-char hex token. Stored only as sha256 digest.
    const raw = randomBytes(32).toString("hex");
    const row: RefreshRow = {
      id: newId("rt"),
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      revokedAt: null,
      userAgent: ctx?.userAgent,
      ip: ctx?.ip,
      createdAt: new Date()
    };
    this.rows.push(row);
    return { token: raw, tokenId: row.id, expiresAt: row.expiresAt };
  }

  async resolve(rawToken: string): Promise<ResolvedRefreshToken | undefined> {
    if (!rawToken) return undefined;
    const hash = hashRefreshToken(rawToken);
    const row = this.rows.find((r) => r.tokenHash === hash);
    if (!row) return undefined;
    if (row.revokedAt) return undefined;
    if (row.expiresAt.getTime() <= Date.now()) return undefined;
    return { tokenId: row.id, userId: row.userId, expiresAt: row.expiresAt };
  }

  async revoke(tokenId: string): Promise<void> {
    const row = this.rows.find((r) => r.id === tokenId);
    if (row && !row.revokedAt) row.revokedAt = new Date();
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const now = new Date();
    for (const r of this.rows) {
      if (r.userId === userId && !r.revokedAt) r.revokedAt = now;
    }
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
  const rooms = new MemoryRoomRepository();
  const messages = new MemoryMessageRepository();
  // Rooms decorate themselves with per-user unread + pinned message id from
  // the message repo; wire that here.
  rooms.setMessageAccessor(messages);
  const decisions = new MemoryDecisionRepository();
  // Decisions need user lookups (for decidedBy author info + recipient
  // counts) and a way to resolve a sourceMessageId back to its roomId so
  // the listing can deep-link "출처 메시지". Closures avoid coupling repos
  // directly.
  decisions.setAccessors({
    getActiveUsers: () => users._data,
    getUserById: (id) => users._data.find((u) => u.id === id),
    getMessageRoomId: (mid) => messages.findRoomIdByMessageIdSync(mid)
  });
  return {
    users,
    departments,
    rooms,
    messages,
    projects,
    tasks,
    products: new MemoryProductRepository(),
    files: new MemoryFileRepository(),
    notices,
    decisions,
    notifications: new MemoryNotificationRepository(),
    pushSubscriptions: new MemoryPushSubscriptionRepository(),
    audit: new MemoryAuditRepository(),
    refreshTokens: new MemoryRefreshTokenRepository()
  };
}
