"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage, MessageReaction } from "@hanmir/shared";
import { REACTION_EMOJI_ALLOWLIST } from "@hanmir/shared";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import styles from "../MessageItem.module.css";

// Phase 11 — 이모지 반응 바. 토글 + "+" popover 로 새 반응 추가.
// MessageItem 본체에서 분리된 자체 완결 블록 — 삭제된 메시지에서는
// 부모가 아예 렌더하지 않는다.
export function ReactionBar({ message }: { message: ChatMessage }) {
  const router = useRouter();
  // Phase 11 — 반응 로컬 패치. props.message.reactions 가 SSR/refresh 로
  // 채워지지만 본인의 토글은 즉시 반영하려면 local state 가 필요.
  // 부모가 refresh 하면 useEffect 가 다시 동기화.
  const [reactions, setReactions] = useState<MessageReaction[]>(message.reactions ?? []);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReactions(message.reactions ?? []);
  }, [message.reactions]);

  // 외부 클릭 / Esc 로 popover 닫기.
  useEffect(() => {
    if (!emojiPopoverOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (emojiPopoverRef.current?.contains(target)) return;
      setEmojiPopoverOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setEmojiPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiPopoverOpen]);

  const handleReactionToggle = async (emoji: string, currentlyMine: boolean) => {
    if (reactionBusy || message.isDeleted) return;
    setReactionBusy(true);
    try {
      const next = currentlyMine
        ? await chatService.removeReaction(message.id, emoji)
        : await chatService.addReaction(message.id, emoji);
      setReactions(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      // 실패 시에는 silent — 다른 탭/사용자의 socket 갱신이 결국 정확한
      // 상태를 가져온다.
    } finally {
      setReactionBusy(false);
    }
  };

  const handleAddNewReaction = async (emoji: string) => {
    setEmojiPopoverOpen(false);
    // 이미 본인이 박은 이모지인지 검사 — 토글 의미상 두 번 클릭은 remove.
    const existing = reactions.find((r) => r.emoji === emoji);
    await handleReactionToggle(emoji, !!existing?.reactedByMe);
  };

  return (
    <div className={styles.reactions}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={cn(styles.react, r.reactedByMe && styles.reactMine)}
          onClick={() => handleReactionToggle(r.emoji, !!r.reactedByMe)}
          disabled={reactionBusy}
          aria-pressed={r.reactedByMe ? true : false}
          title={r.reactedByMe ? "내 반응 — 클릭해 취소" : "반응 추가"}
        >
          {r.emoji} {r.count}
        </button>
      ))}
      <button
        type="button"
        className={cn(styles.react, styles.reactPlain)}
        onClick={() => setEmojiPopoverOpen((o) => !o)}
        aria-label="반응 추가"
        title="반응 추가"
        aria-expanded={emojiPopoverOpen}
      >
        +
      </button>
      {emojiPopoverOpen ? (
        <div
          ref={emojiPopoverRef}
          className={styles.reactPopover}
          role="dialog"
          aria-label="반응 선택"
        >
          {REACTION_EMOJI_ALLOWLIST.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.reactPopoverItem}
              onClick={() => handleAddNewReaction(emoji)}
              disabled={reactionBusy}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
