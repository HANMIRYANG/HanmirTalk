import type {
  ChatMessage,
  CreateDepartmentInput,
  CreateNoticeInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateUserInput,
  Department,
  FileEntry,
  FileFolder,
  Notice,
  NoticeReadStatus,
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

export interface UserRepository {
  list(): Promise<User[]>;
  findById(id: string): Promise<User | undefined>;
  findByEmail(email: string): Promise<User | undefined>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, input: UpdateUserInput): Promise<User | undefined>;
  deactivate(id: string): Promise<User | undefined>;
}

export interface DepartmentRepository {
  list(): Promise<Department[]>;
  findById(id: string): Promise<Department | undefined>;
  create(input: CreateDepartmentInput): Promise<Department>;
  update(id: string, input: UpdateDepartmentInput): Promise<Department | undefined>;
  delete(id: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "in_use" }>;
}

export interface RoomRepository {
  list(): Promise<Room[]>;
  findById(id: string): Promise<Room | undefined>;
}

export interface MessageRepository {
  listByRoom(roomId: string): Promise<ChatMessage[]>;
  append(roomId: string, message: ChatMessage): Promise<ChatMessage>;
  getPinned(roomId: string): Promise<{ author: string; body: string } | undefined>;
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
}

export interface FileRepository {
  listFolders(): Promise<FileFolder[]>;
  listFiles(): Promise<FileEntry[]>;
  findById(id: string): Promise<FileEntry | undefined>;
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
