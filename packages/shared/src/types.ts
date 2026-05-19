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
  mentions?: string[];
  // Phase 2 E-1 — set by PATCH /messages/:id. Frontend renders "(수정됨)"
  // hint next to the timestamp when present. Distinct from any internal
  // updated_at: only body edits touch this field.
  editedAt?: string;
  // Phase 2 E-1 — soft delete marker. When true the API replaces `body`
  // with a placeholder ("삭제된 메시지입니다") and strips `attachment`
  // before returning. UI shows a muted tombstone row.
  isDeleted?: boolean;
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

export interface ProductLot {
  id: string;
  number: string;
  producedAt: string;
  quantity: string;
  trcVersion: string;
  trcStatus: "in_review" | "approved" | "pending";
  verdict: "pass" | "hold" | "retest";
  note?: string;
}

export interface SalesStatusEvent {
  id: string;
  status: SalesStatus;
  title: string;
  meta: string;
  date: string;
  state: "done" | "current" | "future";
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
