"use client";

import type { ChatMessage } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/classNames";
import styles from "../MessageItem.module.css";

// Phase 11 — 답글 chip. count 가 0 이어도 (작성자가 아니어도) 답글을
// 시작할 수 있도록 노출 여부는 부모(MessageItem)가 결정하고, 표시
// 텍스트는 count 에 따라 분기.
export function ThreadChip({
  message,
  onOpenThread
}: {
  message: ChatMessage;
  onOpenThread: (message: ChatMessage) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        styles.thread,
        !message.threadReplyCount && styles.threadEmpty
      )}
      onClick={() => onOpenThread(message)}
    >
      {message.threadReplyAvatars && message.threadReplyAvatars.length > 0 ? (
        <div className={styles.threadAvatars}>
          {message.threadReplyAvatars.map((a, i) => (
            <Avatar
              key={i}
              initials={a.initials}
              tone={a.tone ?? "default"}
              className={styles.threadAvatar}
            />
          ))}
        </div>
      ) : null}
      <span>
        {message.threadReplyCount
          ? `답글 ${message.threadReplyCount}개`
          : "답글 달기"}
      </span>
      {message.threadLastReplyAt ? (
        <span className={styles.threadMuted}>
          · 마지막 답글 {message.threadLastReplyAt}
        </span>
      ) : null}
    </button>
  );
}
