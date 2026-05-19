import type {
  AuditEntry,
  ChatMessage,
  CreateAuditInput,
  CreateDecisionInput,
  CreateDepartmentInput,
  CreateFileInput,
  CreateNoticeInput,
  CreateProductInput,
  CreateProductLotInput,
  CreateProductSpecInput,
  CreateProjectInput,
  CreateRoomInput,
  CreateTaskInput,
  CreateUserInput,
  Decision,
  DecisionReadStatus,
  Department,
  FileEntry,
  FileFolder,
  ListFilesFilter,
  Notice,
  NoticeReadStatus,
  Notification,
  NotificationSettings,
  PinnedMessageRef,
  Product,
  ProductLot,
  ProductSpec,
  Project,
  Room,
  SalesStatusEvent,
  TaskItem,
  UpdateDecisionInput,
  UpdateNotificationSettingsInput,
  UpdateDepartmentInput,
  UpdateProductInput,
  UpdateProductLotInput,
  UpdateProductSpecInput,
  UpdateProjectInput,
  UpdateRoomInput,
  UpdateTaskInput,
  UpdateUserInput,
  User
} from "@hanmir/shared";

export interface AuditRepository {
  record(input: CreateAuditInput): Promise<void>;
  // Returns the most recent entries first. Limit caps the rows fetched.
  list(opts?: { limit?: number; action?: string; actorUserId?: string }): Promise<AuditEntry[]>;
}

// Phase 1 D-3 — DB-backed refresh tokens (paired with in-memory access
// sessionStore). Raw tokens are returned only at issue time and never
// stored; we keep sha256 digests so DB compromise does not leak credentials.
export interface IssuedRefreshToken {
  // Raw token to send to the client (cookie value). Never persisted.
  token: string;
  // Internal row id, used by `rotate` to identify which row to revoke.
  tokenId: string;
  expiresAt: Date;
}

export interface ResolvedRefreshToken {
  tokenId: string;
  userId: string;
  expiresAt: Date;
}

export interface RefreshTokenRepository {
  issue(userId: string, ctx?: { userAgent?: string; ip?: string }): Promise<IssuedRefreshToken>;
  // Returns undefined when the token is missing, revoked, or expired.
  resolve(rawToken: string): Promise<ResolvedRefreshToken | undefined>;
  revoke(tokenId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

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
  // Phase 4 G-1 — room CUD + membership ops.
  // `createdBy` becomes a member with role "owner". Other memberIds get
  // role "member". `type` defaults to "group" if not provided.
  create(input: CreateRoomInput, createdBy: { id: string }): Promise<Room>;
  update(id: string, input: UpdateRoomInput): Promise<Room | undefined>;
  // Direct message rooms (type="direct") between exactly two users. The
  // pair is order-independent and the repo is responsible for finding
  // any existing direct room with this exact pair before creating a new
  // one (idempotent — POST /rooms/direct is safe to call repeatedly).
  findOrCreateDirect(userIdA: string, userIdB: string): Promise<Room>;
  // Add / remove a member. Returns the updated room or undefined when
  // the room doesn't exist. Adding an existing member is a no-op (the
  // server route can still return 200 with the room).
  addMember(id: string, userId: string): Promise<Room | undefined>;
  removeMember(id: string, userId: string): Promise<Room | undefined>;
  // Per-user mute. `enabled=true` mutes (notification_enabled=false in
  // the schema; the column name is a double-negative we keep for backward
  // compatibility). Returns the updated room scoped to this user.
  setMute(id: string, userId: string, muted: boolean): Promise<Room | undefined>;
  // Leave: remove the caller's row. If they were the last member the
  // room transitions to is_active=false (soft archive — no hard delete
  // so historical messages keep their fk references).
  leave(id: string, userId: string): Promise<{ ok: true; archived: boolean } | { ok: false }>;
}

export interface MessageRepository {
  listByRoom(roomId: string): Promise<ChatMessage[]>;
  // Returns a single message regardless of room. Required by the
  // /messages/:id PATCH/DELETE routes to perform ownership checks before
  // mutating. Returns undefined for missing or hard-deleted rows.
  findById(messageId: string): Promise<ChatMessage | undefined>;
  // `opts.attachmentId` links a previously-uploaded file (via POST
  // /files/upload) to the new message. PG: UPDATE attachments SET
  // message_id = ... after INSERT. Memory: already embedded in `message`.
  append(
    roomId: string,
    message: ChatMessage,
    opts?: { attachmentId?: string }
  ): Promise<ChatMessage>;
  // Phase 2 E-1 — edit a message body. Returns the updated message or
  // undefined if missing. Caller (route) is responsible for ownership +
  // soft-delete guards.
  updateBody(messageId: string, body: string): Promise<ChatMessage | undefined>;
  // Phase 2 E-1 — soft delete. Returns whether the row existed; the
  // route layer is responsible for converting that into a 404. Body is
  // masked by the API layer when serializing for clients.
  softDelete(messageId: string): Promise<boolean>;
  // Phase 2 E-3 — substring search across messages. `roomIds` scopes
  // results to rooms the caller can read; the route layer is responsible
  // for computing the right list (admin sees all, others get their own
  // membership). Soft-deleted rows are excluded. Returns most recent first.
  search(opts: { q: string; roomIds: string[]; limit?: number }): Promise<ChatMessage[]>;
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

  // Phase 7 J-1 — product_specs.
  listSpecs(productId: string): Promise<ProductSpec[]>;
  createSpec(productId: string, input: CreateProductSpecInput): Promise<ProductSpec>;
  updateSpec(
    productId: string,
    specId: string,
    input: UpdateProductSpecInput
  ): Promise<ProductSpec | undefined>;
  deleteSpec(productId: string, specId: string): Promise<boolean>;

  // Phase 7 J-1 — product_lots. (lot_no, product_id) UNIQUE.
  listLots(productId: string): Promise<ProductLot[]>;
  createLot(productId: string, input: CreateProductLotInput): Promise<ProductLot>;
  updateLot(
    productId: string,
    lotId: string,
    input: UpdateProductLotInput
  ): Promise<ProductLot | undefined>;
  deleteLot(productId: string, lotId: string): Promise<boolean>;

  // Phase 7 J-1 — sales_status_events 타임라인. PATCH /products/:id 의
  // salesStatus 변경 hook이 append를 호출.
  listSalesEvents(productId: string): Promise<SalesStatusEvent[]>;
  appendSalesEvent(input: {
    productId: string;
    fromStatus?: string;
    toStatus: string;
    reason?: string;
    changedBy: { id: string };
  }): Promise<SalesStatusEvent>;
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

// Phase 3 F-1 — project decisions. CRUD lives here so the route layer
// stays thin; ownership checks (writer role / decided_by) are enforced
// at the route layer like for messages.
export interface DecisionRepository {
  listByProject(projectId: string, userId?: string): Promise<Decision[]>;
  findById(id: string, userId?: string): Promise<Decision | undefined>;
  create(
    projectId: string,
    input: CreateDecisionInput,
    decidedBy: { id: string }
  ): Promise<Decision>;
  update(id: string, input: UpdateDecisionInput): Promise<Decision | undefined>;
  // Soft delete — sets is_deleted=true. Returns whether the row existed.
  softDelete(id: string): Promise<boolean>;
  // Read tracking, mirror of NoticeRepository.markConfirmed.
  markConfirmed(id: string, userId: string): Promise<Decision | undefined>;
  getReadStatus(id: string): Promise<DecisionReadStatus | undefined>;
}

// Phase 6 I-1 — per-user notification inbox + settings.
//
// create(): server-side hooks (메시지 append, 공지 생성 등)에서 호출.
//   settings를 존중해 skip할지는 hook 레이어 책임 — repo는 그냥 저장.
// listForUser(): inbox UI용. unread + 전체 limit.
// markRead / markAllRead: 클릭 또는 [모두 읽음]에서 호출.
// unreadCount: Topbar 종 아이콘 배지용 (전용 endpoint로 light fetch).
// getSettings: 첫 호출 시 default(NotificationSettings) 자동 생성.
// updateSettings: partial update.
export interface CreateNotificationInput {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  payload?: Record<string, unknown>;
}

// Phase 6 I-5 — Web Push subscription. user_id + endpoint UNIQUE.
// p256dh/auth는 PushSubscription.keys 그대로 (base64url 문자열).
export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: string;
}

export interface CreatePushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export interface PushSubscriptionRepository {
  upsert(input: CreatePushSubscriptionInput): Promise<PushSubscriptionRecord>;
  listForUser(userId: string): Promise<PushSubscriptionRecord[]>;
  delete(id: string): Promise<boolean>;
  deleteByEndpoint(userId: string, endpoint: string): Promise<boolean>;
}

export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<Notification>;
  // 여러 유저에게 같은 알림 동시 발송 (메시지 append 시 N명 멤버 등).
  // 반환값은 생성된 알림들. 빈 배열도 가능.
  createMany(
    userIds: string[],
    input: Omit<CreateNotificationInput, "userId">
  ): Promise<Notification[]>;
  listForUser(
    userId: string,
    opts?: { unreadOnly?: boolean; limit?: number }
  ): Promise<Notification[]>;
  unreadCount(userId: string): Promise<number>;
  markRead(id: string, userId: string): Promise<Notification | undefined>;
  markAllRead(userId: string): Promise<{ count: number }>;
  getSettings(userId: string): Promise<NotificationSettings>;
  updateSettings(
    userId: string,
    input: UpdateNotificationSettingsInput
  ): Promise<NotificationSettings>;
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
  decisions: DecisionRepository;
  notifications: NotificationRepository;
  pushSubscriptions: PushSubscriptionRepository;
  audit: AuditRepository;
  refreshTokens: RefreshTokenRepository;
}
