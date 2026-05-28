export type UserRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "project_owner"
  | "member";

export type ProjectStatus =
  | "ready"
  | "in_progress"
  | "review"
  | "on_hold"
  | "done"
  | "cancelled";

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "on_hold";

export type TaskPriority = "top" | "high" | "normal" | "low";

export type SalesStatus =
  | "unavailable"
  | "preparing"
  | "internal"
  | "conditional"
  | "available";

export type RoomType =
  | "direct"
  | "group"
  | "department"
  | "announcement"
  | "project";

export type MessageType =
  | "text"
  | "image"
  | "file"
  | "notice"
  | "system"
  | "task_reference"
  | "decision_reference";

export type FileKind = "pdf" | "doc" | "xls" | "ppt" | "img" | "zip";

export type Presence = "online" | "away" | "off";

export interface Department {
  id: string;
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface CreateDepartmentInput {
  name: string;
  description?: string;
}

export interface UpdateDepartmentInput {
  name?: string;
  description?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  departmentId: string;
  departmentName: string;
  position: string;
  role: UserRole;
  avatarTone?: "default" | "orange" | "green" | "purple" | "gray";
  initials: string;
  presence?: Presence;
  lastSeen?: string;
  isActive?: boolean;
  phone?: string;
  // True when the user still carries a seed/admin-issued password and must
  // change it before any other action. Frontend layout guard routes them to
  // /account/password until this flips false (Phase 1 D-2).
  mustChangePassword?: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  departmentId: string;
  position: string;
  role: UserRole;
  phone?: string;
  avatarTone?: User["avatarTone"];
  initials?: string;
  // TODO: replace `password` with hashed credential issuance flow once
  // bcrypt/argon2 hashing is in place. For MVP the server ignores this field
  // and the user authenticates with the shared `DEFAULT_PASSWORD`.
  password?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  departmentId?: string;
  position?: string;
  role?: UserRole;
  phone?: string;
  avatarTone?: User["avatarTone"];
  initials?: string;
}

// Phase 8 K-2 — 사용자 초대. `status`는 accepted_at / expires_at에서
// 파생된다. `token`은 admin이 초대 URL을 만들 때만 쓰이고, 목록 응답에는
// 포함되지만 화면에는 "URL 복사" 액션으로만 노출한다.
export type InvitationStatus = "pending" | "accepted" | "expired";

export interface UserInvitation {
  id: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  departmentName?: string;
  token: string;
  invitedById: string;
  invitedByName?: string;
  status: InvitationStatus;
  acceptedAt?: string;
  expiresAt: string;
  createdAt: string;
}

export interface CreateInvitationInput {
  email: string;
  role: UserRole;
  departmentId: string;
}

export interface AcceptInviteInput {
  token: string;
  name: string;
  password: string;
}

// Public payload for the accept-invite page — enough to render the form,
// without leaking who invited whom.
export interface InvitationPreview {
  valid: boolean;
  email?: string;
  role?: UserRole;
  departmentName?: string;
}

export interface RoomMember {
  userId: string;
  isOwner?: boolean;
  isManager?: boolean;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  description?: string;
  projectId?: string;
  members: RoomMember[];
  // Per-user unread count (messages newer than this user's last_read_message).
  // 0 when the caller is not authenticated or has no member row.
  unread: number;
  // Per-user mute (Phase 4 G-1). True when the caller has notifications
  // disabled for this room. Server fills it based on the authenticated
  // caller's room_members.notification_enabled.
  muted?: boolean;
  pinned?: boolean;
  // Id of the currently-pinned message in this room (set via POST
  // /rooms/:id/pin). Undefined when nothing is pinned.
  pinnedMessageId?: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageAuthor?: string;
  presenceUserId?: string;
  presence?: Presence;
  avatarLabel?: string;
  avatarTone?: User["avatarTone"];
  tag?: { label: string; tone?: "blue" | "green" | "amber" | "red" | "orange" };
}

// Phase 4 G-1 — payload for POST /rooms (create) and PATCH /rooms/:id (update).
// Creator becomes a member automatically; passing them in memberIds is OK
// (the server dedupes). `type` defaults to "group" when omitted.
export interface CreateRoomInput {
  name: string;
  type?: RoomType;
  description?: string;
  projectId?: string;
  memberIds?: string[];
}

export interface UpdateRoomInput {
  name?: string;
  description?: string;
}

// Returned by GET /rooms/:id/pinned. Lightweight (just the bits the banner
// needs); fetch the full message via listByRoom if more is required.
export interface PinnedMessageRef {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface MessageAttachment {
  id: string;
  kind: FileKind;
  name: string;
  meta: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
}

// Phase 5 H-1 — structured entity reference inside a message body.
// Tracks @mentions, project/task/file pointers, etc. The body is plain
// text; entities tell the renderer which substring to wrap.
//
//   type:   what kind of reference this is.
//   id:     the referenced entity's id (user id for "mention" etc).
//   label:  display label embedded in the body at [offset, offset+length).
//           E.g. for an @mention of 김민준 the label is "김민준" and the
//           body contains "@김민준" with offset pointing at the "@".
//   offset/length: character offsets into `body` (UTF-16 code units, the
//                  way JS String indexing works).
export interface MessageEntity {
  type: "mention" | "project_ref" | "task_ref" | "file_ref";
  id: string;
  label: string;
  offset: number;
  length: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  authorRole?: string;
  avatarTone?: User["avatarTone"];
  initials: string;
  body: string;
  createdAt: string;
  groupedWithPrev?: boolean;
  attachment?: MessageAttachment;
  reactions?: MessageReaction[];
  threadReplyCount?: number;
  threadLastReplyAt?: string;
  threadReplyAvatars?: { initials: string; tone?: User["avatarTone"] }[];
  isMine?: boolean;
  isSystem?: boolean;
  pinned?: boolean;
  // DEPRECATED Phase 5 — legacy string-array mentions ("김민준"). Replaced
  // by `entities` of type=="mention" which carries id + offset/length so
  // rendering is unambiguous. Kept for backward-compat with seed data;
  // new code paths should write `entities` instead.
  mentions?: string[];
  // Phase 5 H-1 — structured references embedded in the body. Empty
  // array when none. See MessageEntity above.
  entities?: MessageEntity[];
  // Phase 5 H-4 — AI provenance. Set by /ai/* endpoints that insert
  // their preview as an actual message after the user confirms.
  aiGenerated?: boolean;
  aiCommand?: string;
  sourceMessageIds?: string[];
  // Phase 2 E-1 — set by PATCH /messages/:id. Frontend renders "(수정됨)"
  // hint next to the timestamp when present. Distinct from any internal
  // updated_at: only body edits touch this field.
  editedAt?: string;
  // Phase 2 E-1 — soft delete marker. When true the API replaces `body`
  // with a placeholder ("삭제된 메시지입니다") and strips `attachment`
  // before returning. UI shows a muted tombstone row.
  isDeleted?: boolean;
}

// Phase 5 H-1 — payload type for /mentions/search results.
export type MentionSearchScope =
  | "user"
  | "department"
  | "project"
  | "task"
  | "file";

export interface MentionSearchResult {
  type: MentionSearchScope;
  id: string;
  label: string;
  // Sub-label rendered under the main label. e.g. department + position
  // for users, project code for tasks.
  sublabel?: string;
  // Optional avatar / icon hint. For users this is initials + tone; for
  // other types the client picks an icon based on `type`.
  initials?: string;
  avatarTone?: User["avatarTone"];
}

export interface Milestone {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  status: "done" | "in_progress" | "pending" | "delayed";
}

export interface Project {
  id: string;
  code: string;
  name: string;
  fullName: string;
  status: ProjectStatus;
  stageLabel: string;
  department: string;
  ownerName: string;
  startDate: string;
  dueDate: string;
  progress: number;
  taskCounts: { done: number; inProgress: number; pending: number; total: number };
  delayedCount: number;
  description: string;
  goals: string[];
  outputs: string[];
  memberIds: string[];
  budget?: string;
  type?: string;
  externalPartners?: string;
  relatedProductIds?: string[];
  milestones: Milestone[];
  salesStatus?: SalesStatus;
}

export interface CreateProjectInput {
  code?: string;
  name: string;
  fullName?: string;
  status?: ProjectStatus;
  stageLabel?: string;
  department?: string;
  ownerName?: string;
  startDate?: string;
  dueDate?: string;
  description?: string;
  goals?: string[];
  outputs?: string[];
  memberIds?: string[];
  budget?: string;
  type?: string;
  externalPartners?: string;
  relatedProductIds?: string[];
  salesStatus?: SalesStatus;
}

export interface UpdateProjectInput {
  code?: string;
  name?: string;
  fullName?: string;
  status?: ProjectStatus;
  stageLabel?: string;
  department?: string;
  ownerName?: string;
  startDate?: string;
  dueDate?: string;
  progress?: number;
  description?: string;
  goals?: string[];
  outputs?: string[];
  budget?: string;
  type?: string;
  externalPartners?: string;
  relatedProductIds?: string[];
  salesStatus?: SalesStatus;
}

export interface ProjectMemberInput {
  userId: string;
}

export interface TaskItem {
  id: string;
  code: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds: string[];
  reviewerId?: string;
  startDate?: string;
  dueDate?: string;
  dueLabel: string;
  dueState?: "late" | "today" | "normal";
  delayDays?: number;
  progress: number;
  subtaskCount?: number;
  isGroupedAsDelayed?: boolean;
}

export interface CreateTaskInput {
  title: string;
  code?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeIds?: string[];
  reviewerId?: string;
  startDate?: string;
  dueDate?: string;
  dueLabel?: string;
  progress?: number;
  description?: string;
}

export interface UpdateTaskInput {
  title?: string;
  code?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeIds?: string[];
  reviewerId?: string;
  startDate?: string;
  dueDate?: string;
  dueLabel?: string;
  dueState?: "late" | "today" | "normal";
  delayDays?: number;
  progress?: number;
  description?: string;
}

// Phase 7 J-1 — DB-backed product lot. Maps to product_lots row.
// `number`는 DB의 lot_no. `quantity`는 NUMERIC(12,2)를 string으로
// 전달 (소수점/포맷 보존). verdict / testedAt / note 모두 optional.
//
// trcVersion / trcStatus는 deprecated — 시험성적서는 product_documents
// (document_type='test_report')에서 별도 관리하므로 lot 자체에는 두지 않음.
// 기존 seed/mock UI 호환을 위해 optional로 남김.
export interface ProductLot {
  id: string;
  productId?: string;
  number: string;
  producedAt?: string;
  quantity?: string;
  verdict?: "pass" | "hold" | "retest";
  testedAt?: string;
  note?: string;
  createdAt?: string;
  // Deprecated — Phase 7에서 시험성적서를 product_documents로 분리. 기존
  // seed mock UI는 이 두 필드를 표시하므로 optional로 유지 (DB 안 들어감).
  trcVersion?: string;
  trcStatus?: "in_review" | "approved" | "pending";
}

export interface CreateProductLotInput {
  number: string;
  producedAt?: string;
  quantity?: string;
  verdict?: "pass" | "hold" | "retest";
  testedAt?: string;
  note?: string;
}

export interface UpdateProductLotInput {
  number?: string;
  producedAt?: string;
  quantity?: string;
  verdict?: "pass" | "hold" | "retest";
  testedAt?: string;
  note?: string;
}

// Phase 7 J-1 — DB-backed sales status event. PATCH /products/:id 의
// salesStatus 변경 시 hook이 자동 insert. changedByName은 server-side
// JOIN 결과 (UI 표시용).
//
// 기존 mock UI에서 쓰던 title/meta/date/state 필드는 deprecated. 새
// 로직은 fromStatus/toStatus/reason/changedAt 기반.
export interface SalesStatusEvent {
  id: string;
  productId?: string;
  fromStatus?: SalesStatus;
  toStatus: SalesStatus;
  reason?: string;
  changedById?: string;
  changedByName?: string;
  changedAt: string;
  // Deprecated — Phase 7 이전 mock UI 호환용. 새 코드는 toStatus +
  // changedAt + reason만 사용.
  status?: SalesStatus;
  title?: string;
  meta?: string;
  date?: string;
  state?: "done" | "current" | "future";
}

// Phase 7 J-1 — DB-backed product spec (key-value).
export interface ProductSpec {
  id: string;
  productId: string;
  key: string;
  value: string;
  sortOrder: number;
}

export interface CreateProductSpecInput {
  key: string;
  value: string;
  sortOrder?: number;
}

export interface UpdateProductSpecInput {
  key?: string;
  value?: string;
  sortOrder?: number;
}

// Phase 7 J-2 — DB-backed product document. A product_documents row links
// an existing attachment to a product under one of the 8 classification
// types from docs/06_PRODUCT_INFO_SPEC.
export type ProductDocumentType =
  | "catalog"
  | "test_report"
  | "proposal"
  | "price_sheet"
  | "install_guide"
  | "faq"
  | "certificate"
  | "image";

export interface ProductDocument {
  id: string;
  productId: string;
  attachmentId: string;
  documentType: ProductDocumentType;
  fileName: string;
  fileKind: FileKind;
  sizeLabel: string;
  uploadedById: string;
  uploadedByName?: string;
  createdAt: string;
}

export interface CreateProductDocumentInput {
  attachmentId: string;
  documentType: ProductDocumentType;
}

export interface CreateProductInput {
  // Only `name` is required; the rest map to the columns the current
  // products table actually has. DTO-only fields (code, fullName, spec,
  // lots, history, quarter) are ignored at the persistence layer until
  // their own tables/columns are added.
  name: string;
  category?: string;
  description?: string;
  features?: string[];
  applications?: string[];
  cautions?: string[];
  salesStatus?: SalesStatus;
  salesNote?: string;
  ownerId?: string;
}

export interface UpdateProductInput {
  name?: string;
  category?: string;
  description?: string;
  features?: string[];
  applications?: string[];
  cautions?: string[];
  salesStatus?: SalesStatus;
  salesNote?: string;
  ownerId?: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  fullName: string;
  shortName?: string;
  category: string;
  subCategory: string;
  description: string;
  features: string[];
  applications: string[];
  cautions: string[];
  salesStatus: SalesStatus;
  salesNote: string;
  salesUpdatedAt: string;
  salesUpdatedBy: string;
  ownerId: string;
  imageLabel?: string;
  spec: { key: string; value: string }[];
  lots: ProductLot[];
  history: SalesStatusEvent[];
  relatedProjectIds: string[];
  documents: { id: string; kind: FileKind; name: string; meta: string }[];
  quarter: {
    totalKg: string;
    revenue: string;
    avgPrice: string;
    topClient: string;
    targetRatio: number;
  };
}

// Phase 9 — 통합 검색 결과. 각 도메인은 검색어에 대해 독립 조회되고
// 도메인별 상한이 있다. messages는 호출자가 접근 가능한 방으로 스코프됨.
export interface SearchResults {
  query: string;
  messages: ChatMessage[];
  files: FileEntry[];
  projects: Project[];
  products: Product[];
}

export interface FileEntry {
  id: string;
  kind: FileKind;
  name: string;
  scope: string;
  scopeTone?: "blue" | "green" | "amber" | "red" | "orange" | "default";
  scopeExtra?: { label: string; tone?: "blue" | "green" | "amber" | "red" | "orange" | "default" };
  size: string;
  uploaderId: string;
  uploadedAt: string;
  starred?: boolean;
  folderId?: string;
  // Optional scope ids — set when an attachment was uploaded against a
  // specific entity. Frontend filtering (e.g. project-only file lists)
  // uses these instead of the human-readable `scope` label.
  projectId?: string;
  productId?: string;
  taskId?: string;
  messageId?: string;
}

export interface FileFolder {
  id: string;
  name: string;
  meta: string;
  tone: "yellow" | "blue" | "orange" | "purple";
}

export interface CreateFileInput {
  // Original filename as uploaded. Stored verbatim in `file_name`.
  fileName: string;
  fileSize: number;
  fileType?: string;
  // Server-managed storage location (relative path or URL). Set by the
  // upload route based on where the bytes were written.
  fileUrl: string;
  // At most one scope id is recorded today. Frontend tags the upload with
  // whichever context the user was in.
  projectId?: string;
  productId?: string;
  taskId?: string;
  messageId?: string;
}

export interface ListFilesFilter {
  projectId?: string;
  productId?: string;
  taskId?: string;
  messageId?: string;
  uploaderId?: string;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  authorTeam: string;
  createdAt: string;
  dueDate?: string;
  isMandatory: boolean;
  totalRecipients: number;
  confirmedCount: number;
  myConfirmed: boolean;
  tone: "red" | "amber" | "green";
}

export interface CreateNoticeInput {
  title: string;
  body: string;
  isMandatory?: boolean;
}

export interface NoticeReadStatusEntry {
  userId: string;
  name: string;
  departmentName: string;
  // ISO timestamp when the recipient hit "확인". Only set on `confirmed`.
  confirmedAt?: string;
}

export interface NoticeReadStatus {
  noticeId: string;
  totalRecipients: number;
  confirmed: NoticeReadStatusEntry[];
  unconfirmed: NoticeReadStatusEntry[];
}

export interface ActivityEvent {
  id: string;
  initials: string;
  tone?: User["avatarTone"];
  author: string;
  body: string;
  context: string;
  time: string;
}

export interface AuditEntry {
  id: string;
  title: string;
  meta: string;
  time: string;
  level: "info" | "warn" | "danger";
}

// Server-side audit log record (Phase 1 D-4). What the auditLog helper
// stores. Translated to AuditEntry for the /admin panel.
export interface CreateAuditInput {
  action: string;
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  level?: "info" | "warn" | "danger";
  ip?: string;
  meta?: unknown;
}

// Phase 8 K-5 — 감사 로그 페이지용 구조화 행. AuditEntry(대시보드 카드용
// 요약)와 달리 필터/페이징을 위해 원본 컬럼을 그대로 노출한다.
export interface AuditLogRow {
  id: string;
  action: string;
  actorName: string;
  actorRole?: string;
  targetType?: string;
  targetLabel?: string;
  level: "info" | "warn" | "danger";
  ip?: string;
  createdAt: string;
}

export interface AuditLogQuery {
  limit?: number;
  offset?: number;
  action?: string;
  actor?: string;
  after?: string;
  before?: string;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
  // 필터 드롭다운용 — 현재 로그에 존재하는 distinct action 목록.
  actions: string[];
}

// Phase 8 K-6 — 서비스 상태 / 버전.
export interface SystemHealth {
  status: "ok" | "degraded";
  adapter: "memory" | "postgres";
  uptimeSeconds: number;
  startedAt: string;
  socketClients: number;
  database: {
    ok: boolean;
    pool?: { total: number; idle: number; waiting: number };
  };
  timestamp: string;
}

export interface SystemVersion {
  version: string;
  gitCommit: string;
  node: string;
  env: string;
}

// Phase 8 K-3 — 보안 / 로그인 정책 (읽기 전용 표시). 변경은 .env / 코드.
export interface SecurityPolicy {
  passwordMinLength: number;
  passwordHash: string;
  forcePasswordChangeOnFirstLogin: boolean;
  accessTokenTtlMinutes: number;
  refreshTokenTtlDays: number;
  refreshTokenRotation: boolean;
  cookieHttpOnly: boolean;
  cookieSameSite: string;
  cookieSecure: boolean;
  uploadMaxMb: number;
  auditLogging: boolean;
  smtpEnabled: boolean;
}

export interface AdminKpi {
  label: string;
  value: string;
  sub: string;
  highlight?: "danger" | "warn";
  progress?: number;
}

// Phase 3 F-1 — project decisions (결정사항). Source of truth lives in the
// `decisions` table (001_initial.sql) plus 012_decisions.sql for is_deleted
// and decision_reads. The DTO renames `related_message_id` → `sourceMessageId`
// to match the roadmap vocabulary; the column stays for backward compat.
export interface Decision {
  id: string;
  projectId: string;
  title: string;
  content: string;
  // Who recorded the decision. Not necessarily the same as the author of
  // any source message — they could record someone else's verbal call.
  decidedById: string;
  decidedByName: string;
  decidedByRole?: string;
  // Date the decision was made (not created_at). The user enters this when
  // making the decision row; defaults to today.
  decisionDate: string;
  // Optional pointer back to the chat message that triggered the decision.
  // When set, the UI surfaces a "출처 메시지 보기" link that deep-links into
  // the room.
  sourceMessageId?: string;
  sourceRoomId?: string;
  createdAt: string;
  updatedAt: string;
  // Phase 3 read-status (roadmap §Q decision 4). Populated by the server
  // from decision_reads when the caller is authenticated.
  totalRecipients: number;
  confirmedCount: number;
  myConfirmed: boolean;
  // Soft delete tombstone; the API masks `content` like it does for
  // messages so deleted decisions show up greyed-out in the timeline.
  isDeleted?: boolean;
}

export interface CreateDecisionInput {
  title: string;
  content: string;
  // Defaults to today if omitted.
  decisionDate?: string;
  // When created from a message via /messages/:id/create-decision the route
  // fills these in. Direct creation via /projects/:id/decisions may omit.
  sourceMessageId?: string;
}

export interface UpdateDecisionInput {
  title?: string;
  content?: string;
  decisionDate?: string;
}

export interface DecisionReadStatusEntry {
  userId: string;
  name: string;
  departmentName: string;
  confirmedAt?: string;
}

export interface DecisionReadStatus {
  decisionId: string;
  totalRecipients: number;
  confirmed: DecisionReadStatusEntry[];
  unconfirmed: DecisionReadStatusEntry[];
}

// Phase 6 I-1 — per-user notification inbox.
// kind은 카테고리. UI에서 아이콘/그룹화에 사용. server 측 enum 강제는
// 안 함 (백엔드 hook 추가가 자유로워야 함).
//   message:new          — 같은 방의 새 메시지
//   mention              — 본인을 @멘션하는 메시지
//   notice:new           — 새 공지
//   task:assigned        — 본인이 새 assignee로 추가됨
//   project:updated      — 프로젝트 상태 변경
//   decision:new         — 새 결정사항 (해당 프로젝트 멤버)
export interface Notification {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body?: string;
  // 클릭 시 이동할 라우트 (예: /chat/r-xxx, /notices, /projects/p-xxx)
  link?: string;
  // 도메인별 부가 데이터 (예: { roomId, messageId } 또는 { projectId, taskId })
  payload?: Record<string, unknown>;
  // null/undefined ⇒ 미확인. read_at 타임스탬프 들어가면 확인 완료.
  readAt?: string;
  createdAt: string;
}

export interface NotificationSettings {
  userId: string;
  allEnabled: boolean;
  // { "<roomId>": false } 형식. 명시 안 된 room id는 default on.
  perRoom: Record<string, boolean>;
  perProject: Record<string, boolean>;
  webPushEnabled: boolean;
  browserEnabled: boolean;
}

export interface UpdateNotificationSettingsInput {
  allEnabled?: boolean;
  perRoom?: Record<string, boolean>;
  perProject?: Record<string, boolean>;
  webPushEnabled?: boolean;
  browserEnabled?: boolean;
}

// Phase 8 K-4 — 전사 기본 알림 정책. 알림 카테고리별 회사 전체 게이트.
export type NotificationCategory =
  | "message"
  | "mention"
  | "notice"
  | "task"
  | "project"
  | "decision";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "message",
  "mention",
  "notice",
  "task",
  "project",
  "decision"
];

export interface OrgNotificationDefault {
  category: NotificationCategory;
  enabled: boolean;
  updatedAt?: string;
  updatedByName?: string;
}

export interface UpdateOrgNotificationDefaultInput {
  enabled: boolean;
}

// Phase 10 M-4 — 예약 전송. setTimeout 기반이 아니라 DB 영속 + 1분 주기
// poller. 서버 재시작/배포에도 살아남는다. status 는 row state 에서 파생:
//   sent_at      → "sent"
//   cancelled_at → "cancelled"
//   error 존재   → "failed"
//   둘 다 NULL   → "pending"
export type ScheduledMessageStatus = "pending" | "sent" | "cancelled" | "failed";

export interface ScheduledMessage {
  id: string;
  roomId: string;
  roomName?: string;
  userId: string;
  authorName?: string;
  content: string;
  entities: MessageEntity[];
  attachmentId?: string;
  attachmentName?: string;
  // ISO 8601 timestamp. 클라이언트는 사용자 로컬 시간을 datetime-local 로
  // 받아 toISOString 으로 변환해 전송 — 서버는 UTC 로 저장하고 비교한다.
  scheduledAt: string;
  sentAt?: string;
  cancelledAt?: string;
  error?: string;
  status: ScheduledMessageStatus;
  createdAt: string;
}

export interface CreateScheduledMessageInput {
  roomId: string;
  content: string;
  scheduledAt: string;
  entities?: MessageEntity[];
  attachmentId?: string;
}
