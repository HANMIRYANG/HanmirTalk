"use client";

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { FileEntry } from "@hanmir/shared";
import {
  BoldIcon,
  CloseIcon,
  EmojiIcon,
  ItalicIcon,
  ListIcon,
  MentionIcon,
  PaperclipIcon,
  TaskIcon
} from "@/components/ui/icons";
import { chatService } from "@/services/chat.service";
import { fileService } from "@/services/file.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "./MessageComposer.module.css";

interface MessageComposerProps {
  roomId: string;
  roomName: string;
  // Used as upload scope so attachments uploaded from a project room land
  // tagged with the project, making them visible on /projects/[id]/files.
  projectId?: string;
}

export function MessageComposer({ roomId, roomName, projectId }: MessageComposerProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<FileEntry | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickAttachment = () => {
    if (uploading || sending) return;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await fileService.uploadFile(file, projectId ? { projectId } : {});
      setAttachment(uploaded);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 413) {
        setError("파일이 너무 큽니다.");
      } else {
        setError("파일 업로드에 실패했습니다.");
      }
    } finally {
      setUploading(false);
    }
  };

  const clearAttachment = () => {
    setAttachment(null);
  };

  const send = async () => {
    const trimmed = value.trim();
    if ((!trimmed && !attachment) || sending) return;
    setSending(true);
    setError(null);
    try {
      await chatService.sendMessage(roomId, trimmed, {
        attachmentId: attachment?.id
      });
      setValue("");
      setAttachment(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("세션이 만료되었습니다. 다시 로그인해 주세요.");
        handleSessionExpired(router);
      } else if (err instanceof ApiError && err.status === 403) {
        setError("이 채팅방에 메시지를 보낼 권한이 없습니다.");
      } else {
        setError("메시지 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className={styles.composer}>
      <div className={styles.box}>
        <div className={styles.toolbar}>
          <button className={styles.tbBtn} title="굵게" type="button">
            <BoldIcon size={14} />
          </button>
          <button className={styles.tbBtn} title="기울임" type="button">
            <ItalicIcon size={14} />
          </button>
          <button className={styles.tbBtn} title="목록" type="button">
            <ListIcon size={14} />
          </button>
          <span className={styles.divider} />
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={onFileSelected}
          />
          <button
            className={styles.tbBtn}
            title="파일 첨부"
            type="button"
            onClick={pickAttachment}
            disabled={uploading || sending}
          >
            <PaperclipIcon size={16} />
          </button>
          <button className={styles.tbBtn} title="멘션" type="button">
            <MentionIcon size={14} />
          </button>
          <button className={styles.tbBtn} title="이모지" type="button">
            <EmojiIcon size={14} />
          </button>
          <span className={styles.divider} />
          <button className={styles.tbBtn} title="업무 만들기" type="button">
            <TaskIcon size={14} />
          </button>
        </div>
        <textarea
          className={styles.input}
          rows={2}
          placeholder={`${roomName} 에 메시지 보내기...`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        {uploading ? (
          <div className={styles.attachChip} role="status">
            <span>파일 업로드 중...</span>
          </div>
        ) : null}
        {attachment ? (
          <div className={styles.attachChip}>
            <span title={attachment.name} className={styles.attachName}>
              📎 {attachment.name}
            </span>
            <span className={styles.attachMeta}>{attachment.size}</span>
            <button
              type="button"
              className={styles.attachRemove}
              onClick={clearAttachment}
              aria-label="첨부 제거"
              title="첨부 제거"
              disabled={sending}
            >
              <CloseIcon size={12} />
            </button>
          </div>
        ) : null}
        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        <div className={styles.foot}>
          <div className={styles.hint}>
            <span className="kbd">Enter</span> 전송 · <span className="kbd">Shift + Enter</span>{" "}
            줄바꿈
          </div>
          <div className={styles.send}>
            <button className="btn btn--outline btn--sm" type="button" disabled={sending}>
              예약 전송
            </button>
            <button
              className="btn btn--primary btn--sm"
              type="button"
              onClick={send}
              disabled={sending || uploading || (!value.trim() && !attachment)}
            >
              {sending ? "전송 중..." : "전송 →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
