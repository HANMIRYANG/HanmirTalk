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
  ListFilesFilter,
  Notice,
  NoticeReadStatus,
  PinnedMessageRef,
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

export interface UserRepository {
  list(): Promise<User[]>;
  findById(id: string): Promise<User | undefined>;
  findByEmail(email: string): Promise<User | undefined>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, input: UpdateUserInput): Promise<User | undefined>;
  deactivate(id: string): Promise<User | undefined>;
  // bcrypt-based password operations. Hash storage is repo-internal so the
  // User DTO stays free of password fields.
  verifyPassword(userId: string, plain: string): Promise<boolean>;
  setPassword(userId: string, plain: string): Promise<void>;
}

export interface DepartmentRepository {
  list(): Promise<Department[]>;
  findById(id: string): Promise<Department | undefined>;
  create(input: CreateDepartmentInput): Promise<Department>;
  update(id: string, input: UpdateDepartmentInput): Promise<Department | undefined>;
  delete(id: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "in_use" }>;
}

export interface RoomRepository {
  // `userId` enables per-user unread counts and is required for the
  // accurate badge. Calls without it (e.g. unauth) get unread=0.
  list(userId?: string): Promise<Room[]>;
  findById(id: string, userId?: string): Promise<Room | undefined>;
}

export interface MessageRepository {
  listByRoom(roomId: string): Promise<ChatMessage[]>;
  // `opts.attachmentId` links a previously-uploaded file (via POST
  // /files/upload) to the new message. PG: UPDATE attachments SET
  // message_id = ... after INSERT. Memory: already embedded in `message`.
  append(
    roomId: string,
    message: ChatMessage,
    opts?: { attachmentId?: string }
  ): Promise<ChatMessage>;
  // Marks `lastMessageId` as the most recent message this user has seen.
  // Memory: keeps a Map. PG: updates room_members.last_read_message_id.
  // Caller-side responsibility to send the latest visible id from the UI.
  markRead(roomId: string, userId: string, lastMessageId: string): Promise<void>;
  // Single pinned message per room. `pin` validates that the message
  // belongs to the room and sets `rooms.pinned_message_id`. `unpin`
  // clears it. Both return whether the room was found.
  pin(roomId: string, messageId: string): Promise<"ok" | "room_not_found" | "message_not_in_room">;
  unpin(roomId: string): Promise<"ok" | "room_not_found">;
  getPinned(roomId: string): Promise<PinnedMessageRef | undefined>;
}

export interface ProjectRepository {
  list(): Promise<Project[]>;
  findById(id: string): Promise<Project | undefined>;
  create(input: CreateProjectInput): Promise<Project>;
  update(id: string, input: UpdateProjectInput): Promise<Project | undefined>;
  // Soft delete: status -> "cancelled". Returns undefined when not found.
  cancel(id: string): Promise<Project | undefined>;
  addMember(id: string, userId: string): Promise<Project | undefined>;
  removeMember(id: string, userId: string): Promise<Project | undefined>;
}

export interface TaskRepository {
  list(): Promise<TaskItem[]>;
  listByProject(projectId: string): Promise<TaskItem[]>;
  findById(id: string): Promise<TaskItem | undefined>;
  create(projectId: string, input: CreateTaskInput): Promise<TaskItem>;
  update(id: string, input: UpdateTaskInput): Promise<TaskItem | undefined>;
  delete(id: string): Promise<boolean>;
}

export interface ProductRepository {
  list(): Promise<Product[]>;
  findById(id: string): Promise<Product | undefined>;
  create(input: CreateProductInput): Promise<Product>;
  update(id: string, input: UpdateProductInput): Promise<Product | undefined>;
  delete(id: string): Promise<boolean>;
}

export interface FileRepository {
  listFolders(): Promise<FileFolder[]>;
  listFiles(filter?: ListFilesFilter): Promise<FileEntry[]>;
  findById(id: string): Promise<FileEntry | undefined>;
  // `uploaderId` is the authenticated user. The route already moved the
  // bytes to disk and passes back the storage path via `input.fileUrl`.
  create(input: CreateFileInput, uploaderId: string): Promise<FileEntry>;
  // Returns false when the row is absent. The route deletes the on-disk
  // file based on `findStorage` *before* calling this.
  delete(id: string): Promise<boolean>;
  // Server-internal: returns the original filename + on-disk path so the
  // download/delete routes can stream or unlink. Not exposed via API.
  findStorage(id: string): Promise<{ fileName: string; fileUrl: string; fileType?: string } | undefined>;
}

export interface NoticeRepository {
  list(userId?: string): Promise<Notice[]>;
  findById(id: string, userId?: string): Promise<Notice | undefined>;
  // `author` is the writer of the notice. Memory uses `departmentName` to
  // fill `authorTeam`; postgres only needs `id` (the JOIN derives the team).
  create(
    input: CreateNoticeInput,
    author: { id: string; departmentName: string }
  ): Promise<Notice>;
  // Per-user confirmation. `userId` is required so we can flip the right
  // user's flag (memory) or insert into `notice_reads` (postgres).
  markConfirmed(id: string, userId: string): Promise<Notice | undefined>;
  // Returns undefined when the notice does not exist. Recipients = all active
  // users; `confirmed` is whoever has flipped the per-user flag, `unconfirmed`
  // is everyone else.
  getReadStatus(id: string): Promise<NoticeReadStatus | undefined>;
}

export interface Repositories {
  users: UserRepository;
  departments: DepartmentRepository;
  rooms: RoomRepository;
  messages: MessageRepository;
  projects: ProjectRepository;
  tasks: TaskRepository;
  products: ProductRepository;
  files: FileRepository;
  notices: NoticeRepository;
}
