"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { DownloadIcon, PinIcon } from "@/components/ui/icons";
import { fileService } from "@/services/file.service";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import { MessagePinButton } from "./MessagePinButton";
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
  isAdmin = false
}: MessageItemProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          {(canEdit || canDelete) && !editing ? (
            <span className={styles.actions}>
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
            {renderBodyWithMentions(message.body, message.mentions)}
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
    </div>
  );
}

function renderBodyWithMentions(body: string, mentions?: string[]) {
  if (!mentions || mentions.length === 0) return body;
  const parts: (string | JSX.Element)[] = [];
  let remaining = body;
  let key = 0;
  for (const name of mentions) {
    const token = `@${name}`;
    const idx = remaining.indexOf(token);
    if (idx === -1) continue;
    parts.push(remaining.slice(0, idx));
    parts.push(
      <span key={key++} className={styles.mention}>
        {token}
      </span>
    );
    remaining = remaining.slice(idx + token.length);
  }
  parts.push(remaining);
  return parts;
}
