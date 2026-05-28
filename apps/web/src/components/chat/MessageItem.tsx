"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage, User } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { DownloadIcon, PinIcon } from "@/components/ui/icons";
import { fileService } from "@/services/file.service";
import { chatService } from "@/services/chat.service";
import { decisionService } from "@/services/decision.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import { MessagePinButton } from "./MessagePinButton";
import { TaskCreateModal } from "@/app/(app)/projects/[id]/tasks/TaskCreateModal";
import styles from "./MessageItem.module.css";

interface MessageItemProps {
  message: ChatMessage;
  // Optional context for actions. When omitted, only the read-only render
  // is produced (e.g. for embedding messages elsewhere).
  roomId?: string;
  isPinned?: boolean;
  canPin?: boolean;
  // Phase 2 E-1 — passed by the chat room page so MessageItem can decide
  // whether to show "수정 / 삭제" hover actions. Author can do both;
  // admins can delete others' messages (server enforces this too).
  currentUserId?: string;
  isAdmin?: boolean;
  // Phase 3 F-2c — show "결정사항으로 만들기" hover action when (1) the
  // room is project-bound (projectId set) AND (2) the caller has writer
  // role. Server enforces both too via /messages/:id/create-decision.
  canCreateDecision?: boolean;
  projectId?: string;
  // Phase 10 M-3 — 메시지 → 업무 만들기. canCreateDecision 과 같은
  // 게이트 (프로젝트 방 + writer 역할). users 가 같이 제공되어야
  // TaskCreateModal 의 담당자 선택 목록을 채울 수 있다.
  canCreateTask?: boolean;
  users?: User[];
}

const fileColor: Record<string, string> = {
  pdf: styles.icPdf,
  xls: styles.icXls,
  doc: styles.icDoc,
  ppt: styles.icPpt,
  img: styles.icImg,
  zip: styles.icZip
};

const fileLabel: Record<string, string> = {
  pdf: "PDF",
  xls: "XLSX",
  doc: "DOCX",
  ppt: "PPTX",
  img: "IMG",
  zip: "ZIP"
};

export function MessageItem({
  message,
  roomId,
  isPinned = false,
  canPin = false,
  currentUserId,
  isAdmin = false,
  canCreateDecision = false,
  projectId,
  canCreateTask = false,
  users
}: MessageItemProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  if (message.isSystem) {
    return (
      <div className={styles.sys}>
        <span>{message.body}</span>
      </div>
    );
  }

  const isMine = !!currentUserId && message.authorId === currentUserId;
  const canEdit = isMine && !message.isDeleted;
  const canDelete = (isMine || isAdmin) && !message.isDeleted;

  const startEdit = () => {
    setError(null);
    setDraft(message.body);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(message.body);
    setError(null);
  };

  const saveEdit = async () => {
    const next = draft.trim();
    if (!next) {
      setError("내용을 입력해주세요.");
      return;
    }
    if (next === message.body) {
      // No-op edit; just exit edit mode.
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await chatService.updateMessage(message.id, next);
      setEditing(false);
      // Server emits message:updated → other clients refresh via socket.
      // For the actor we still router.refresh() so SSR re-renders with the
      // new body / editedAt without waiting for socket round-trip.
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setError("본인이 작성한 메시지만 수정할 수 있습니다.");
        return;
      }
      setError("저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const onConfirmDelete = async () => {
    if (busy) return;
    if (!window.confirm("이 메시지를 삭제하시겠습니까? (복구 불가)")) return;
    setBusy(true);
    try {
      await chatService.deleteMessage(message.id);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        window.alert("삭제 권한이 없습니다.");
        return;
      }
      window.alert("삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter saves; Esc cancels. Plain Enter inserts a newline
    // (multi-line edits should be easy).
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  return (
    <div
      className={cn(
        styles.msg,
        message.groupedWithPrev && styles.grouped,
        message.isDeleted && styles.deleted
      )}
    >
      <div className={styles.avatarBlock}>
        <Avatar
          initials={message.initials}
          tone={message.avatarTone ?? "default"}
          className={styles.avatar}
        />
      </div>
      <div>
        <div className={styles.head}>
          <span className={styles.name}>{message.authorName}</span>
          {message.authorRole ? <span className={styles.role}>{message.authorRole}</span> : null}
          <span className={styles.time}>{message.createdAt}</span>
          {message.editedAt && !message.isDeleted ? (
            <span className={styles.editedTag} title={`수정됨: ${message.editedAt}`}>
              (수정됨)
            </span>
          ) : null}
          {isPinned && !message.isDeleted ? (
            <span className={styles.pinTag} title="고정된 메시지">
              <PinIcon size={11} /> 고정됨
            </span>
          ) : null}
          {canPin && roomId && !message.isDeleted ? (
            <MessagePinButton
              roomId={roomId}
              messageId={message.id}
              isPinned={isPinned}
            />
          ) : null}
          {(canEdit ||
            canDelete ||
            (canCreateDecision && !message.isDeleted) ||
            (canCreateTask && !message.isDeleted && projectId && users)) &&
          !editing ? (
            <span className={styles.actions}>
              {canCreateTask && !message.isDeleted && projectId && users ? (
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setTaskModalOpen(true)}
                  aria-label="업무로 만들기"
                  title="이 메시지를 프로젝트 업무로 추가"
                >
                  업무
                </button>
              ) : null}
              {canCreateDecision && !message.isDeleted && projectId ? (
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setDecisionModalOpen(true)}
                  aria-label="결정사항으로 만들기"
                  title="이 메시지를 프로젝트 결정사항으로 기록"
                >
                  결정사항
                </button>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={startEdit}
                  aria-label="수정"
                >
                  수정
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className={cn(styles.actionBtn, styles.actionDanger)}
                  onClick={onConfirmDelete}
                  disabled={busy}
                  aria-label="삭제"
                >
                  삭제
                </button>
              ) : null}
            </span>
          ) : null}
        </div>

        {editing ? (
          <div className={styles.editor}>
            <textarea
              className={styles.editTextarea}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={Math.min(8, Math.max(2, draft.split("\n").length))}
              disabled={busy}
              autoFocus
            />
            <div className={styles.editFoot}>
              <span className={styles.editHint}>Ctrl+Enter 저장 · Esc 취소</span>
              <div className={styles.editBtns}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={cancelEdit}
                  disabled={busy}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => void saveEdit()}
                  disabled={busy}
                >
                  저장
                </button>
              </div>
            </div>
            {error ? <div className={styles.editError}>{error}</div> : null}
          </div>
        ) : (
          <div className={styles.body}>
            {message.aiGenerated && !message.isDeleted ? (
              <span className={styles.aiBadge} title="AI 명령으로 생성된 메시지">
                AI 초안
              </span>
            ) : null}
            {renderMessageBody(message)}
          </div>
        )}

        {message.attachment && !message.isDeleted ? (
          <div className={styles.file}>
            <div className={cn(styles.fileIc, fileColor[message.attachment.kind])}>
              {fileLabel[message.attachment.kind]}
            </div>
            <div>
              <div className={styles.fileName}>{message.attachment.name}</div>
              <div className={styles.fileMeta}>{message.attachment.meta}</div>
            </div>
            <div className={styles.fileActions}>
              <a
                href={fileService.downloadUrl(message.attachment.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--outline btn--sm"
                aria-label="다운로드"
                title="다운로드"
              >
                <DownloadIcon size={14} />
              </a>
            </div>
          </div>
        ) : null}

        {message.reactions && message.reactions.length > 0 && !message.isDeleted ? (
          <div className={styles.reactions}>
            {message.reactions.map((r) => (
              <span key={r.emoji} className={styles.react}>
                {r.emoji} {r.count}
              </span>
            ))}
            <span className={cn(styles.react, styles.reactPlain)}>+</span>
          </div>
        ) : null}

        {message.threadReplyCount && !message.isDeleted ? (
          <div className={styles.thread}>
            <div className={styles.threadAvatars}>
              {message.threadReplyAvatars?.map((a, i) => (
                <Avatar
                  key={i}
                  initials={a.initials}
                  tone={a.tone ?? "default"}
                  className={styles.threadAvatar}
                />
              ))}
            </div>
            <span>답글 {message.threadReplyCount}개</span>
            {message.threadLastReplyAt ? (
              <span className={styles.threadMuted}>· 마지막 답글 {message.threadLastReplyAt}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      {decisionModalOpen && projectId ? (
        <CreateDecisionFromMessageModal
          messageId={message.id}
          messageBody={message.body}
          projectId={projectId}
          onClose={() => setDecisionModalOpen(false)}
        />
      ) : null}
      {taskModalOpen && projectId && users ? (
        <TaskCreateModal
          open
          onClose={() => setTaskModalOpen(false)}
          projectId={projectId}
          users={users}
          defaultStatus="todo"
          initialTitle={message.body.split("\n")[0]?.slice(0, 80) ?? ""}
          initialDescription={message.body}
        />
      ) : null}
    </div>
  );
}

// Phase 3 F-2c — modal launched from MessageItem's hover menu. Pre-fills
// the title (first line of the message, truncated) and content (full
// body) so the user only has to confirm or tweak. On success we navigate
// to the project's decisions page so they see the new entry in context.
function CreateDecisionFromMessageModal({
  messageId,
  messageBody,
  projectId,
  onClose
}: {
  messageId: string;
  messageBody: string;
  projectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const firstLine = messageBody.split("\n")[0]?.slice(0, 80) ?? "";
  const [title, setTitle] = useState(firstLine);
  const [content, setContent] = useState(messageBody);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    if (!title.trim() || !content.trim()) {
      setError("제목과 내용을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      await decisionService.createFromMessage(messageId, {
        title: title.trim(),
        content: content.trim(),
        decisionDate: date
      });
      onClose();
      router.push(`/projects/${projectId}/decisions`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        setError("이 메시지를 결정사항으로 만들 수 없습니다 (소스가 프로젝트 방이 아닐 수 있습니다).");
        return;
      }
      setError("저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <form
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h2 className={styles.modalTitle}>이 메시지를 결정사항으로 기록</h2>
        <p className={styles.modalHint}>
          저장 후 프로젝트 결정 기록 페이지에서 확인 추적이 시작됩니다.
        </p>
        <label className={styles.modalLabel}>
          제목
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            autoFocus
            required
          />
        </label>
        <label className={styles.modalLabel}>
          내용
          <textarea
            className={styles.modalTextarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            disabled={busy}
            required
          />
        </label>
        <label className={styles.modalLabel}>
          결정일
          <input
            className="field"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
            required
          />
        </label>
        {error ? <div className={styles.modalError}>{error}</div> : null}
        <div className={styles.modalBtns}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            disabled={busy}
          >
            취소
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            {busy ? "저장 중…" : "결정사항으로 저장"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Phase 5 H-2b + Phase 10 — entities 사이 plain text segment 에만
// 마크다운(`**bold**`, `*italic*`, 줄 시작 `- `) 을 적용한다. entity
// 안에서는 파싱하지 않아 멘션 표시가 흐트러지지 않음. 삭제된 메시지는
// body 가 마스킹 텍스트("삭제된 메시지입니다") 라 매칭이 없어 자연히
// 평범한 텍스트로 렌더된다. dangerouslySetInnerHTML 사용 금지 —
// React node 트리만 반환.
function renderMessageBody(message: ChatMessage) {
  const { body, entities, mentions } = message;
  if (entities && entities.length > 0) {
    const sorted = [...entities].sort((a, b) => a.offset - b.offset);
    const out: (string | JSX.Element)[] = [];
    let cursor = 0;
    let key = 0;
    sorted.forEach((e, i) => {
      if (e.offset < cursor) return; // overlap → skip
      if (e.offset > cursor) {
        out.push(
          ...renderMarkdownSegment(body.slice(cursor, e.offset), `e${i}p`)
        );
      }
      const tokenText = body.slice(e.offset, e.offset + e.length);
      const cls = e.type === "mention" ? styles.mention : styles.entityRef;
      out.push(
        <span key={`ent-${i}`} className={cls} title={e.label}>
          {tokenText}
        </span>
      );
      cursor = e.offset + e.length;
      key += 1;
    });
    if (cursor < body.length) {
      out.push(...renderMarkdownSegment(body.slice(cursor), `e${key}t`));
    }
    return out;
  }
  // Legacy mentions[] fallback — 서버가 entities 를 비워 보낸 시드 데이터.
  // 마크다운은 동일하게 적용하되, 멘션 토큰만 강조한다.
  if (mentions && mentions.length > 0) {
    const out: (string | JSX.Element)[] = [];
    let remaining = body;
    let key = 0;
    for (const name of mentions) {
      const token = `@${name}`;
      const idx = remaining.indexOf(token);
      if (idx === -1) continue;
      if (idx > 0) out.push(...renderMarkdownSegment(remaining.slice(0, idx), `lm${key}p`));
      out.push(
        <span key={`lm-${key}`} className={styles.mention}>
          {token}
        </span>
      );
      remaining = remaining.slice(idx + token.length);
      key += 1;
    }
    if (remaining.length > 0) {
      out.push(...renderMarkdownSegment(remaining, `lm${key}t`));
    }
    return out;
  }
  return renderMarkdownSegment(body, "p");
}

// Phase 10 — 한 단락(entity 사이 plain text)에 한해 줄 단위로 list bullet
// 처리 후, 인라인 마크다운(**, *) 을 파싱한다. 줄바꿈은 원본 그대로
// 보존되므로(.body 가 white-space: pre-wrap) 별도 wrapping div 불필요.
function renderMarkdownSegment(text: string, keyPrefix: string): JSX.Element[] {
  if (!text) return [];
  const out: JSX.Element[] = [];
  // \n 도 결과 배열에 보존되도록 capture group split.
  const chunks = text.split(/(\n)/);
  let k = 0;
  for (const chunk of chunks) {
    if (chunk === "\n") {
      out.push(<span key={`${keyPrefix}-${k++}`}>{"\n"}</span>);
      continue;
    }
    if (chunk === "") continue;
    const bulletMatch = /^-\s+(.*)$/.exec(chunk);
    if (bulletMatch) {
      out.push(
        <span key={`${keyPrefix}-${k++}`} className={styles.listLine}>
          <span className={styles.bullet}>•</span>
          {parseInlineMarkdown(bulletMatch[1], `${keyPrefix}-${k}i`)}
        </span>
      );
      continue;
    }
    const inline = parseInlineMarkdown(chunk, `${keyPrefix}-${k}i`);
    out.push(<span key={`${keyPrefix}-${k++}`}>{inline}</span>);
  }
  return out;
}

// Phase 10 — `**bold**` 와 `*italic*` 만 지원하는 작은 인라인 파서.
// 욕심 부리지 않음 — backslash escape, 중첩, link, code 등은 처리하지
// 않는다 (사내 메신저 본문에 필요한 최소만). `**` 가 `*` 보다 먼저
// 매칭되도록 정규식 순서를 고정.
function parseInlineMarkdown(text: string, keyPrefix: string): (string | JSX.Element)[] {
  const out: (string | JSX.Element)[] = [];
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) {
      out.push(<strong key={`${keyPrefix}-${k++}`}>{t.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={`${keyPrefix}-${k++}`}>{t.slice(1, -1)}</em>);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
