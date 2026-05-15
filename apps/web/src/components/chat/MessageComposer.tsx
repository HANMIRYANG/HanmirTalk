"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BoldIcon,
  EmojiIcon,
  ItalicIcon,
  ListIcon,
  MentionIcon,
  PaperclipIcon,
  TaskIcon
} from "@/components/ui/icons";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "./MessageComposer.module.css";

interface MessageComposerProps {
  roomId: string;
  roomName: string;
}

export function MessageComposer({ roomId, roomName }: MessageComposerProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await chatService.sendMessage(roomId, trimmed);
      setValue("");
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
          <button className={styles.tbBtn} title="파일 첨부" type="button">
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
              disabled={sending || !value.trim()}
            >
              {sending ? "전송 중..." : "전송 →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
