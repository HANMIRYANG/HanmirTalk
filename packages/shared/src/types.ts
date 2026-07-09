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
  // Phase 11 — 본인이 이 이모지를 박았는지. 토글 UX 의 active 스타일·정렬
  // 기준. 서버 측에서 viewer userId 기준으로 채워준다. 인증 없는 경로
  // 에서는 undefined / false 가 그대로 전달돼도 안전.
  reactedByMe?: boolean;
}

// Phase 11 — 서버 측 화이트리스트. 사내 메신저 맥락에서 자주 쓸 6종.
// 라우트의 ALLOWED_REACTION_EMOJIS 와 동일하다 — single source of truth.
export const REACTION_EMOJI_ALLOWLIST: readonly string[] = [
  "👍",
  "✅",
  "🙏",
  "🎉",
  "👀",
  "📌"
];

// 반응 상세 — 이모지별 누가 반응했는지. GET /messages/:id/reactions 응답.
export interface MessageReactionDetailUser {
  userId: string;
  name: string;
}

export interface MessageReactionDetail {
  emoji: string;
  users: MessageReactionDetailUser[];
}

// 메시지 읽음 확인 — 방 멤버(작성자 제외) 기준으로 last_read 포인터가
// 이 메시지 이후인지 비교해 읽음/안 읽음을 가른다.
// GET /messages/:id/read-status 응답.
export interface MessageReadStatusEntry {
  userId: string;
  name: string;
  departmentName: string;
}

export interface MessageReadStatus {
  messageId: string;
  readers: MessageReadStatusEntry[];
  unread: MessageReadStatusEntry[];
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
  // Phase 11 — 스레드 답글 식별자. top-level 메시지는 undefined, 답글은
  // 부모 메시지 id. 검색이 답글까지 포함할 때 결과의 parent 라우팅에
  // 사용한다.
  parentMessageId?: string;
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

export interface CreateMilestoneInput {
  title: string;
  subtitle?: string;
  date: string;
  status?: Milestone["status"];
}

export interface UpdateMilestoneInput {
  title?: string;
  subtitle?: string;
  date?: string;
  status?: Milestone["status"];
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
  // true = progress 는 수정 모달에서 직접 지정한 값. false/undefined =
  // 업무 완료율(taskCounts.done/total)로 자동 계산된 값.
  progressManual?: boolean;
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
  // "auto" = 업무 완료율 자동 계산으로 전환(progress 무시),
  // "manual" = progress 수동값 사용. 생략 시 모드 변경 없음.
  progressMode?: "auto" | "manual";
  description?: string;
  goals?: string[];
  outputs?: string[];
  budget?: string;
  type?: string;
  externalPartners?: string;
  relatedProductIds?: string[];
  salesStatus?: SalesStatus;
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
  // products table actually has. DTO-only fields (fullName, spec, history,
  // quarter) are ignored at the persistence layer until their own
  // tables/columns are added.
  name: string;
  code?: string;
  category?: string;
  subCategory?: string;
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
  code?: string;
  category?: string;
  subCategory?: string;
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
  // 대표 이미지 — product_documents 중 document_type='image' 최신 1건의
  // attachment id. 목록/상세 썸네일이 /files/:id/download 로 렌더한다.
  imageAttachmentId?: string;
  spec: { key: string; value: string }[];
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

// 파일함 폴더 — DB 엔티티 (migration 023).
//   - 최상위 폴더(부서 폴더): admin/super_admin 만 생성. memberIds 가
//     "참여자" — 그 트리 안에서 하위 폴더를 만들 수 있는 사용자 목록.
//   - 하위 폴더: 루트의 참여자(또는 admin/super_admin)만 생성 가능,
//     생성 시 선택적으로 비밀번호 설정 가능 (hasPassword).
//   - 비밀번호 해시는 API 로 절대 노출하지 않는다.
export interface FileFolder {
  id: string;
  name: string;
  parentId?: string;
  // 루트 폴더의 참여자 user id 목록. 하위 폴더는 빈 배열 (루트에서 상속).
  memberIds: string[];
  hasPassword: boolean;
  createdBy: string;
  createdAt: string;
  // 직속 항목 수 (목록 표시용)
  fileCount: number;
  childCount: number;
}

export interface CreateFolderInput {
  name: string;
  // 없으면 최상위(부서) 폴더 — admin/super_admin 전용
  parentId?: string;
  // 하위 폴더에만 허용
  password?: string;
  // 최상위 폴더에만 의미 (참여자 목록)
  memberIds?: string[];
}

export interface UpdateFolderInput {
  name?: string;
  memberIds?: string[];
}

// GET /files/folders/:id/contents 응답
export interface FolderContents {
  folder: FileFolder;
  subfolders: FileFolder[];
  files: FileEntry[];
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
  // 파일함 폴더에 업로드할 때 지정 (migration 023)
  folderId?: string;
}

export interface ListFilesFilter {
  projectId?: string;
  productId?: string;
  taskId?: string;
  messageId?: string;
  uploaderId?: string;
  folderId?: string;
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
  // deprecated — 방별 알림은 방 음소거(room_members.notification_enabled)
  // 로 일원화됨 (마이그레이션 024). 필드는 API 호환을 위해 유지하나
  // notify.ts 는 더 이상 참조하지 않고 설정 UI 에서도 제거됨.
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

// Phase 11 — 답글 생성 입력. attachment 는 첫 버전에서 미지원이라 옵션
// 으로 두되 route 에서 거절한다 (필요할 때 손쉽게 풀 수 있도록).
export interface CreateReplyInput {
  body: string;
  entities?: MessageEntity[];
}

// Phase 11 — 답글 추가/삭제로 부모 메시지의 스레드 chip 만 갱신할 때
// emit. drawer 가 열린 상태가 아닐 때도 부모 라인의 N개 / 마지막 시각이
// 업데이트되도록 가벼운 payload.
export interface ThreadSummary {
  parentMessageId: string;
  roomId: string;
  replyCount: number;
  lastReplyAt?: string;
  replyAvatars: { initials: string; tone?: User["avatarTone"] }[];
}

// Phase 11 — 이모지 반응 토글 emit payload. messageId + 집계된 reactions
// 만 보내면 클라이언트가 자기 ChatMessage 를 patch 할 수 있다.
export interface ReactionUpdate {
  roomId: string;
  messageId: string;
  reactions: MessageReaction[];
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 12 — ERP 재고/전표 + MES 연동 준비.
// product_specs(설명용 key-value)와 별개로, 재고를 나누는 판매/포장 규격은
// product_variants 로 분리한다. 모든 금액/수량은 직렬화 단순화를 위해 number
// 로 주고받는다(DB 는 NUMERIC).
// ─────────────────────────────────────────────────────────────────────────

// 재고 거래 방향. 입고/출고/조정/취소(복원).
export type InventoryDirection = "in" | "out" | "adjust" | "cancel";

// 전표 유형/상태.
export type ErpDocumentType = "sale" | "use";
export type ErpDocumentStatus = "active" | "cancelled";

// 외부(MES) 동기화 상태.
export type ErpSyncStatus = "pending" | "sent" | "failed" | "ignored";

// 판매/포장 규격. kg_per_unit 으로 총 재고 kg 환산. 예) 18kg / 4L / 말통.
export interface ProductVariant {
  id: string;
  productId: string;
  code: string;
  name: string;
  unitLabel: string;
  kgPerUnit: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductVariantInput {
  code: string;
  name: string;
  unitLabel: string;
  kgPerUnit?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateProductVariantInput {
  code?: string;
  name?: string;
  unitLabel?: string;
  kgPerUnit?: number;
  sortOrder?: number;
  isActive?: boolean;
}

// 출하/보관 창고. 스크린샷의 '출하창고'(코드+이름).
export interface Warehouse {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarehouseInput {
  code: string;
  name: string;
  isActive?: boolean;
}

export interface UpdateWarehouseInput {
  code?: string;
  name?: string;
  isActive?: boolean;
}

// (규격 × 창고) 현재고. 조회 시 표시용 이름들을 JOIN 해서 함께 내려준다.
export interface InventoryBalance {
  productVariantId: string;
  warehouseId: string;
  quantity: number;
  quantityKg: number;
  updatedAt: string;
  productId?: string;
  productName?: string;
  variantCode?: string;
  variantName?: string;
  unitLabel?: string;
  warehouseCode?: string;
  warehouseName?: string;
}

// 제품 단위 재고 요약. 제품 상세 화면의 규격별 재고 + 총 kg 표시용.
export interface ProductInventorySummary {
  productId: string;
  totalKg: number;
  variants: {
    productVariantId: string;
    variantCode: string;
    variantName: string;
    unitLabel: string;
    kgPerUnit: number;
    totalQuantity: number;
    totalKg: number;
    byWarehouse: {
      warehouseId: string;
      warehouseCode: string;
      warehouseName: string;
      quantity: number;
      quantityKg: number;
    }[];
  }[];
}

// append-only 재고 거래 원장 row.
export interface InventoryTransaction {
  id: string;
  productId: string;
  productVariantId: string;
  warehouseId: string;
  direction: InventoryDirection;
  quantity: number;
  unitLabel: string;
  kgPerUnitSnapshot: number;
  quantityKg: number;
  sourceType?: string;
  sourceId?: string;
  note?: string;
  createdById: string;
  createdByName?: string;
  createdAt: string;
  externalRef?: string;
  syncStatus?: ErpSyncStatus;
  lastSyncedAt?: string;
}

// 전표 라인. 작성 시 product_variant_id 를 기준으로 재고를 차감한다.
export interface ErpDocumentLine {
  id: string;
  documentId: string;
  lineNo: number;
  productId?: string;
  productVariantId?: string;
  warehouseId?: string;
  itemCode?: string;
  itemName?: string;
  specLabel?: string;
  quantity: number;
  unitPrice: number;
  supplyAmount: number;
  vatAmount: number;
  note?: string;
  serialLot?: string;
  createdAt: string;
}

// 라인 작성 입력. supplyAmount/vatAmount 를 생략하면 서버가
// quantity*unitPrice 와 공급가액 10% 로 자동 계산한다(부가세는 수기 우선).
export interface CreateErpDocumentLineInput {
  productId?: string;
  productVariantId?: string;
  warehouseId?: string;
  itemCode?: string;
  itemName?: string;
  specLabel?: string;
  quantity: number;
  unitPrice?: number;
  supplyAmount?: number;
  vatAmount?: number;
  note?: string;
  serialLot?: string;
}

export interface ErpDocument {
  id: string;
  documentNo: string;
  documentType: ErpDocumentType;
  status: ErpDocumentStatus;
  documentDate: string;
  managerId?: string;
  managerName?: string;
  customerName?: string;
  warehouseId?: string;
  warehouseName?: string;
  transactionType?: string;
  currency: string;
  contact?: string;
  address?: string;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  note?: string;
  createdById: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  lines: ErpDocumentLine[];
  externalRef?: string;
  syncStatus?: ErpSyncStatus;
  lastSyncedAt?: string;
}

export interface CreateErpDocumentInput {
  documentType?: ErpDocumentType;
  documentDate: string;
  managerId?: string;
  customerName?: string;
  warehouseId?: string;
  transactionType?: string;
  currency?: string;
  contact?: string;
  address?: string;
  note?: string;
  lines: CreateErpDocumentLineInput[];
  // 관리자 전용: 재고 부족 시에도 음수 재고를 허용하고 저장.
  allowNegative?: boolean;
}

// 전표 목록/검색 쿼리.
export interface ErpDocumentQuery {
  from?: string;
  to?: string;
  type?: ErpDocumentType;
  customer?: string;
  status?: ErpDocumentStatus;
  limit?: number;
}

// MES 매핑 / 동기화 이력(Phase 12-F 골격).
export interface MesProductMapping {
  id: string;
  productId: string;
  productVariantId?: string;
  mesProductId?: string;
  mesItemCode?: string;
  mesUnitLabel?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMesProductMappingInput {
  productId: string;
  productVariantId?: string;
  mesProductId?: string;
  mesItemCode?: string;
  mesUnitLabel?: string;
  isActive?: boolean;
}

export interface UpdateMesProductMappingInput {
  productVariantId?: string;
  mesProductId?: string;
  mesItemCode?: string;
  mesUnitLabel?: string;
  isActive?: boolean;
}

export interface MesSyncRun {
  id: string;
  direction: "inbound" | "outbound";
  status: "running" | "success" | "failed";
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}

// ── 회의 녹음 → AI 회의록 파이프라인 ─────────────────────────────────
//
// recording: 브라우저가 청크 업로드 중
// pending → transcribing → awaiting_ppt → summarizing → generating_docs:
//   서버 워커 파이프라인. awaiting_ppt 는 부서별 주간보고 PPT 업로드 대기 —
//   워커가 클레임하지 않으며 업로드/건너뛰기/타임아웃으로 summarizing 재개.
// completed / failed / cancelled: 종결
export type MeetingStatus =
  | "recording"
  | "pending"
  | "transcribing"
  | "awaiting_ppt"
  | "summarizing"
  | "generating_docs"
  | "completed"
  | "failed"
  | "cancelled";

export interface Meeting {
  id: string;
  // 방 삭제 시(ON DELETE SET NULL) undefined — 회의 데이터 자체는 보존.
  roomId?: string;
  title: string;
  startedBy: string;
  // 표시용 decoration (서버가 users 조인으로 채움)
  startedByName?: string;
  // ISO — 프론트 경과시간 표시·4시간 컷의 기준 시각
  startedAt: string;
  endedAt?: string;
  status: MeetingStatus;
  // 클라이언트 보고 duration 누적 (근사치)
  durationMs: number;
  // 현재(마지막) 세그먼트 인덱스. 새로고침 복원 시 프론트가 다음
  // 세그먼트를 시작하는 기준.
  currentSegIndex: number;
  // transcribing 진행률 — meeting:updated 소켓 payload 에서만 채워진다.
  progress?: { done: number; total: number };
  // awaiting_ppt 진입 시각 (ISO) — PPT 대기 타임아웃 기준
  pptRequestedAt?: string;
  error?: string;
  createdAt: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  note: string;
}

// AI 폼 초안 — 제품 등록(MSDS/시험성적서 PDF 파싱)과 프로젝트 등록
// (자연어 프롬프트)을 Claude 가 폼 필드 초안으로 변환한 결과. 사용자가
// 폼에서 수정 후 제출하는 보조 기능이라 모든 필드는 빈 값 허용.
export interface ProductDraft {
  name: string;
  code: string;
  category: string;
  subCategory: string;
  description: string;
  features: string[];
  applications: string[];
  cautions: string[];
  specs: { key: string; value: string }[];
}

export interface ProjectDraft {
  name: string;
  fullName: string;
  code: string;
  department: string;
  description: string;
  goals: string[];
  outputs: string[];
  type: string;
  budget: string;
  externalPartners: string;
  startDate: string; // YYYY-MM-DD (불명이면 "")
  dueDate: string;
  milestones: { title: string; subtitle: string; date: string }[];
}

// Claude 회의록 구조화 출력 (fenced JSON) — DOCX 렌더 입력.
// 파싱 실패 시 structured=null 로 저장하고 원문 텍스트 폴백 렌더.
// v2 (031_meeting_ppt): 부서 중심 구조 — 부서별 주간보고 PPT 를 기준으로
// 부서를 나누고, 부서마다 안건 토픽 한 줄씩 + 결정사항 + 피드백을 정리한다.
// PPT 없이 생성된 경우 부서는 전사에서 추론되며, 특정 부서로 귀속하기
// 어려운 내용은 name="공통" 항목으로 들어간다.
export interface MeetingMinutesData {
  overview: string;
  // 화자 목록 ("화자1", "화자2 (홍길동 추정)" 등 — 실명 매핑은 추후 수정 가능)
  attendees: string[];
  departments: {
    name: string; // 예: "생산부", "연구소", "공통"
    // 안건 토픽 — 토픽당 한 줄 (부서당 여러 개 가능)
    topics: string[];
    decisions: string[];
    // 피드백/지시사항
    feedback: string[];
  }[];
  // 담당자/내용/기한 — 회의에서 언급된 경우만
  actionItems: { assignee: string; item: string; due: string }[];
}
