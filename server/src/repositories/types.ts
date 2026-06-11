import type {
  AuditEntry,
  AuditLogPage,
  AuditLogQuery,
  ChatMessage,
  CreateAuditInput,
  CreateDecisionInput,
  CreateDepartmentInput,
  CreateFileInput,
  CreateNoticeInput,
  CreateProductInput,
  CreateProductLotInput,
  CreateProductSpecInput,
  CreateProductVariantInput,
  CreateWarehouseInput,
  CreateErpDocumentInput,
  CreateMesProductMappingInput,
  CreateProjectInput,
  CreateRoomInput,
  CreateScheduledMessageInput,
  CreateTaskInput,
  CreateUserInput,
  Decision,
  UserInvitation,
  DecisionReadStatus,
  Department,
  FileEntry,
  FileFolder,
  ListFilesFilter,
  Notice,
  NoticeReadStatus,
  Notification,
  NotificationSettings,
  OrgNotificationDefault,
  PinnedMessageRef,
  Product,
  ProductDocument,
  ProductDocumentType,
  ProductLot,
  ProductSpec,
  ProductVariant,
  ProductInventorySummary,
  Warehouse,
  InventoryBalance,
  InventoryTransaction,
  InventoryDirection,
  ErpDocument,
  ErpDocumentQuery,
  MesProductMapping,
  MesSyncRun,
  Project,
  Room,
  SalesStatusEvent,
  ScheduledMessage,
  TaskItem,
  UpdateDecisionInput,
  UpdateNotificationSettingsInput,
  UpdateDepartmentInput,
  UpdateProductInput,
  UpdateProductLotInput,
  UpdateProductSpecInput,
  UpdateProductVariantInput,
  UpdateWarehouseInput,
  UpdateMesProductMappingInput,
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
  // Phase 8 K-5 — paginated + filtered search for the /admin/audit page.
  search(query: AuditLogQuery): Promise<AuditLogPage>;
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
  // Phase 11 — `viewerUserId` 가 주어지면 reactions[].reactedByMe 가
  // 본인 기준으로 채워지고, listByRoom 은 top-level 만 반환 + thread
  // aggregate 가 함께 붙는다. 답글은 listReplies 로 별도 조회.
  // opts.limit: 최신 N개 윈도우 (시간 오름차순으로 반환). opts.beforeId:
  // 해당 메시지보다 오래된 것만 — "이전 메시지 보기" 커서.
  listByRoom(
    roomId: string,
    viewerUserId?: string,
    opts?: { limit?: number; beforeId?: string }
  ): Promise<ChatMessage[]>;
  // Returns a single message regardless of room. Required by the
  // /messages/:id PATCH/DELETE routes to perform ownership checks before
  // mutating. Returns undefined for missing or hard-deleted rows.
  findById(messageId: string, viewerUserId?: string): Promise<ChatMessage | undefined>;
  // Phase 11 — 답글 목록. parent_message_id = parentMessageId 인 메시지를
  // 시간순(오래된 → 최근) 으로. soft-deleted 도 포함 (tombstone), reactions
  // 도 같이 채워진다.
  listReplies(parentMessageId: string, viewerUserId?: string): Promise<ChatMessage[]>;
  // `opts.attachmentId` links a previously-uploaded file (via POST
  // /files/upload) to the new message. PG: UPDATE attachments SET
  // message_id = ... after INSERT. Memory: already embedded in `message`.
  append(
    roomId: string,
    message: ChatMessage,
    opts?: { attachmentId?: string }
  ): Promise<ChatMessage>;
  // Phase 11 — 답글 append. parent_message_id 컬럼만 다르고 나머지는
  // 일반 append 와 동일 흐름. 본 메서드는 parent 의 존재/삭제 여부 검증
  // 책임은 라우트에 위임한다 (이미 loadAccessibleMessage 가 검증함).
  appendReply(
    parentMessageId: string,
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
  // 메시지 읽음 확인 — 방 멤버(작성자·비활성 제외) 를 last_read 포인터의
  // 시간 비교로 읽음/안 읽음 둘로 가른다. 메시지가 없으면 undefined.
  getReadStatus(
    messageId: string
  ): Promise<import("@hanmir/shared").MessageReadStatus | undefined>;
  // Single pinned message per room. `pin` validates that the message
  // belongs to the room and sets `rooms.pinned_message_id`. `unpin`
  // clears it. Both return whether the room was found.
  pin(roomId: string, messageId: string): Promise<"ok" | "room_not_found" | "message_not_in_room">;
  unpin(roomId: string): Promise<"ok" | "room_not_found">;
  getPinned(roomId: string): Promise<PinnedMessageRef | undefined>;
}

// Phase 11 — 이모지 반응. (message_id, user_id, emoji) PK 라 한 사용자가
// 같은 메시지에 같은 이모지를 두 번 박지 못한다.
//
// listForMessages 는 messages 목록(top-level 또는 replies) 을 받았을 때
// N+1 회피용 배치 lookup. Map<messageId, MessageReaction[]> 반환.
export interface MessageReactionRepository {
  // Idempotent — 이미 존재하면 false (no-op). 새로 추가되면 true.
  add(messageId: string, userId: string, emoji: string): Promise<boolean>;
  // Idempotent — 존재하지 않아도 false (no-op).
  remove(messageId: string, userId: string, emoji: string): Promise<boolean>;
  // 단일 메시지의 reaction aggregate. 토글 직후 응답 + emit payload 에 사용.
  listForMessage(
    messageId: string,
    viewerUserId?: string
  ): Promise<import("@hanmir/shared").MessageReaction[]>;
  // 배치 — listByRoom / listReplies 가 한 번에 채울 때.
  listForMessages(
    messageIds: string[],
    viewerUserId?: string
  ): Promise<Map<string, import("@hanmir/shared").MessageReaction[]>>;
  // 반응 상세 — 이모지별 누가 반응했는지 (사용자 이름 포함). 반응 수
  // 내림차순 정렬.
  listDetailForMessage(
    messageId: string
  ): Promise<import("@hanmir/shared").MessageReactionDetail[]>;
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
  // 마감 임박 폴러 전용 — dueDate 가 있고 status != 'done' 인 task 만.
  // PG 에서는 WHERE 로 걸러 전체 스캔을 피한다.
  listDueCandidates(): Promise<TaskItem[]>;
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

  // Phase 7 J-2 — product_documents. Classifies an existing attachment as
  // one of the 8 product document types. `type` filters the list.
  listDocuments(productId: string, type?: string): Promise<ProductDocument[]>;
  // Returns undefined when the attachment does not exist / is not scoped to
  // this product.
  createDocument(
    productId: string,
    attachmentId: string,
    documentType: ProductDocumentType
  ): Promise<ProductDocument | undefined>;
  // Returns the freed attachment id so the route can drop the file too.
  deleteDocument(
    productId: string,
    docId: string
  ): Promise<{ attachmentId: string } | undefined>;
}

// Phase 12 — ERP 전표 저장 결과. 재고 차감은 documents/lines/transactions/
// balances 를 하나의 트랜잭션으로 처리하므로, 부족분이 있으면(그리고
// allowNegative 가 아니면) 아무것도 커밋하지 않고 부족 내역을 돌려준다.
export type CreateErpDocumentResult =
  | { ok: true; document: ErpDocument }
  | {
      ok: false;
      error: "insufficient_stock";
      shortages: {
        productVariantId: string;
        warehouseId: string;
        available: number;
        requested: number;
      }[];
    }
  | { ok: false; error: "empty_lines" | "variant_not_found" | "warehouse_not_found" };

// Phase 12 — 관리자 초기 재고/조정 일괄 입력 1행.
export interface InventoryAdjustmentRow {
  productVariantId: string;
  warehouseId: string;
  quantity: number;
  direction?: InventoryDirection; // 기본 'adjust'
  note?: string;
}

// Phase 12 — ERP 재고 원장 + 전표. 재고 차감/복원은 PG 구현에서 단일
// 트랜잭션으로 처리한다(메모리 구현은 in-process 직렬 실행으로 모사).
export interface ErpRepository {
  // ── 판매/포장 규격(product_variants) ──
  listVariants(productId: string): Promise<ProductVariant[]>;
  listAllVariants(): Promise<ProductVariant[]>;
  findVariantById(id: string): Promise<ProductVariant | undefined>;
  createVariant(productId: string, input: CreateProductVariantInput): Promise<ProductVariant>;
  updateVariant(
    id: string,
    input: UpdateProductVariantInput
  ): Promise<ProductVariant | undefined>;

  // ── 창고(warehouses) ──
  listWarehouses(): Promise<Warehouse[]>;
  findWarehouseById(id: string): Promise<Warehouse | undefined>;
  createWarehouse(input: CreateWarehouseInput): Promise<Warehouse>;
  updateWarehouse(id: string, input: UpdateWarehouseInput): Promise<Warehouse | undefined>;

  // ── 재고(inventory_balances / inventory_transactions) ──
  listInventory(filter: {
    productId?: string;
    warehouseId?: string;
  }): Promise<InventoryBalance[]>;
  getProductInventorySummary(productId: string): Promise<ProductInventorySummary>;
  listTransactions(filter: {
    productId?: string;
    productVariantId?: string;
    warehouseId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<InventoryTransaction[]>;
  // 관리자 초기 재고/조정 일괄 등록. 각 행을 inventory_transactions +
  // balances 에 반영하고 반영된 거래 수를 돌려준다.
  importInventory(
    rows: InventoryAdjustmentRow[],
    actor: { id: string }
  ): Promise<{ applied: number }>;

  // ── 전표(erp_documents / erp_document_lines) ──
  // 저장 성공 시 즉시 재고 차감(Phase 12-C). allowNegative=true 면 음수
  // 재고를 허용(관리자). 전표번호는 전역 연번으로 발급.
  createDocument(
    input: CreateErpDocumentInput,
    actor: { id: string }
  ): Promise<CreateErpDocumentResult>;
  listDocuments(query: ErpDocumentQuery): Promise<ErpDocument[]>;
  findDocumentById(id: string): Promise<ErpDocument | undefined>;
  // 취소: status='cancelled' + 반대 방향('cancel') 거래로 재고 복원.
  // 이미 취소된 전표면 undefined.
  cancelDocument(
    id: string,
    actor: { id: string }
  ): Promise<ErpDocument | undefined>;

  // ── MES 매핑(골격) ──
  listMesMappings(productId?: string): Promise<MesProductMapping[]>;
  createMesMapping(input: CreateMesProductMappingInput): Promise<MesProductMapping>;
  updateMesMapping(
    id: string,
    input: UpdateMesProductMappingInput
  ): Promise<MesProductMapping | undefined>;
  listMesSyncRuns(limit?: number): Promise<MesSyncRun[]>;
}

// 폴더 생성 입력 — 라우트가 비밀번호를 bcrypt 해시로 변환해 넘긴다.
export interface CreateFolderRepoInput {
  name: string;
  parentId?: string;
  passwordHash?: string;
  memberIds?: string[];
}

export interface UpdateFolderRepoInput {
  name?: string;
  memberIds?: string[];
}

export interface FileRepository {
  listFolders(): Promise<FileFolder[]>;
  findFolderById(id: string): Promise<FileFolder | undefined>;
  createFolder(input: CreateFolderRepoInput, createdBy: string): Promise<FileFolder>;
  updateFolder(id: string, input: UpdateFolderRepoInput): Promise<FileFolder | undefined>;
  // 빈 폴더 검증은 라우트 책임 — repo 는 행 삭제만 한다.
  deleteFolder(id: string): Promise<boolean>;
  // 비밀번호 검증용. undefined = 폴더 없음, null = 비밀번호 미설정.
  folderPasswordHash(id: string): Promise<string | null | undefined>;
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
  // notify 훅의 N+1 회피용 일괄 조회. 누락 사용자는 default 로 lazy-create.
  getSettingsMany(userIds: string[]): Promise<Map<string, NotificationSettings>>;
  updateSettings(
    userId: string,
    input: UpdateNotificationSettingsInput
  ): Promise<NotificationSettings>;
}

// Phase 8 K-2 — 사용자 초대. raw token으로 비인증 accept 흐름을 식별한다.
export interface InvitationRepository {
  list(): Promise<UserInvitation[]>;
  findByToken(token: string): Promise<UserInvitation | undefined>;
  create(input: {
    email: string;
    role: string;
    departmentId: string;
    token: string;
    expiresAt: string;
    invitedBy: { id: string };
  }): Promise<UserInvitation>;
  // Atomic claim — returns false if the invitation was already accepted or
  // is missing, so concurrent accepts cannot both win.
  markAccepted(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// Phase 10 M-4 — 예약 메시지. DB 영속이라 server 재시작에도 살아남음.
// 1분 주기 poller 가 listDue 로 due row 를 가져와 일반 메시지 append 경로
// 로 발사한 뒤 markSent 로 마감한다. 동시 인스턴스 가정 X (단일 VM, N-0).
export interface ScheduledMessageRepository {
  create(
    input: CreateScheduledMessageInput,
    author: { id: string }
  ): Promise<ScheduledMessage>;
  findById(id: string): Promise<ScheduledMessage | undefined>;
  // 본인이 만든 예약. 기본은 sent/cancelled 제외 (pending 만). roomId 필터
  // 가 있으면 그 방의 예약만 반환.
  listForUser(
    userId: string,
    opts?: { roomId?: string; includeAll?: boolean }
  ): Promise<ScheduledMessage[]>;
  // Poller scan — scheduled_at <= now AND sent_at IS NULL AND
  // cancelled_at IS NULL AND error IS NULL.
  listDue(now: Date): Promise<ScheduledMessage[]>;
  // 발사 성공 → sent_at = now. sent_at IS NULL guard 로 중복 방지 — 이미
  // 표시되어 있으면 false 반환.
  markSent(id: string, now: Date): Promise<boolean>;
  // 실패 마킹 — error 만 채우고 retry 는 하지 않음 (단일 instance 라
  // 누락 가능성이 낮고, 잘못된 row 의 무한 retry 위험이 더 큼).
  markFailed(id: string, error: string): Promise<void>;
  // 작성자/관리자 취소. 이미 sent 된 건은 false (전송 후 회수는 일반
  // 메시지 삭제 흐름으로).
  cancel(id: string, now: Date): Promise<boolean>;
}

// Phase 8 K-4 — 전사 기본 알림 정책 (카테고리별 회사 전체 게이트).
export interface OrgNotificationRepository {
  // 6개 카테고리 전체를 반환 — 행이 없는 카테고리는 enabled:true.
  list(): Promise<OrgNotificationDefault[]>;
  // notify.ts dispatch 게이트.
  isCategoryEnabled(category: string): Promise<boolean>;
  setEnabled(
    category: string,
    enabled: boolean,
    updatedBy: string
  ): Promise<OrgNotificationDefault>;
}

export interface Repositories {
  users: UserRepository;
  departments: DepartmentRepository;
  rooms: RoomRepository;
  messages: MessageRepository;
  projects: ProjectRepository;
  tasks: TaskRepository;
  products: ProductRepository;
  erp: ErpRepository;
  files: FileRepository;
  notices: NoticeRepository;
  decisions: DecisionRepository;
  notifications: NotificationRepository;
  pushSubscriptions: PushSubscriptionRepository;
  audit: AuditRepository;
  refreshTokens: RefreshTokenRepository;
  invitations: InvitationRepository;
  orgNotifications: OrgNotificationRepository;
  scheduledMessages: ScheduledMessageRepository;
  messageReactions: MessageReactionRepository;
}
