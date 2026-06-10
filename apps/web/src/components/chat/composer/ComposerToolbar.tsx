"use client";

import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import {
  BoldIcon,
  EmojiIcon,
  ItalicIcon,
  ListIcon,
  MentionIcon,
  PaperclipIcon
} from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import { EmojiPickerPopover } from "./EmojiPickerPopover";
import styles from "../MessageComposer.module.css";

interface ComposerToolbarProps {
  sending: boolean;
  uploading: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onPickAttachment: () => void;
  onWrapSelection: (prefix: string, suffix: string) => void;
  onPrefixLines: (linePrefix: string) => void;
  onMentionClick: () => void;
  onPickEmoji: (emoji: string) => void;
}

// Composer 상단 서식/첨부/멘션/이모지 toolbar. 텍스트 편집 자체는 호출부의
// 핸들러로 위임하고, 이모지 popover 의 열림 토글만 여기서 소유한다.
export function ComposerToolbar({
  sending,
  uploading,
  fileInputRef,
  onFileSelected,
  onPickAttachment,
  onWrapSelection,
  onPrefixLines,
  onMentionClick,
  onPickEmoji
}: ComposerToolbarProps) {
  // Phase 10 — emoji picker popover. 단일 boolean toggle. picker가 열려도
  // textarea 포커스를 유지하기 위해 mousedown 에서 preventDefault.
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);

  // Phase 10 — close emoji picker on outside click or Escape.
  // NOTE: DOM 의 native KeyboardEvent 가 필요하므로 globalThis.KeyboardEvent
  // 로 명시 — React 합성 이벤트 타입과 혼동하지 않도록 유지.
  useEffect(() => {
    if (!emojiOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (emojiPopoverRef.current?.contains(target)) return;
      if (emojiBtnRef.current?.contains(target)) return;
      setEmojiOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  const handlePickEmoji = (emoji: string) => {
    onPickEmoji(emoji);
    setEmojiOpen(false);
  };

  return (
    <div className={styles.toolbar}>
      <button
        className={styles.tbBtn}
        title="굵게 (선택한 텍스트를 **로 감싸기)"
        type="button"
        onMouseDown={(e) => {
          // mousedown + preventDefault — textarea 포커스 유지로
          // selectionStart/End 가 살아있게 함.
          e.preventDefault();
          onWrapSelection("**", "**");
        }}
        disabled={sending}
      >
        <BoldIcon size={14} />
      </button>
      <button
        className={styles.tbBtn}
        title="기울임 (선택한 텍스트를 *로 감싸기)"
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onWrapSelection("*", "*");
        }}
        disabled={sending}
      >
        <ItalicIcon size={14} />
      </button>
      <button
        className={styles.tbBtn}
        title="목록 (각 줄 앞에 - 추가)"
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onPrefixLines("- ");
        }}
        disabled={sending}
      >
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
        onClick={onPickAttachment}
        disabled={uploading || sending}
      >
        <PaperclipIcon size={16} />
      </button>
      <button
        className={styles.tbBtn}
        title="멘션 (텍스트에 @ 입력)"
        type="button"
        onClick={onMentionClick}
      >
        <MentionIcon size={14} />
      </button>
      <button
        ref={emojiBtnRef}
        className={cn(styles.tbBtn, emojiOpen && styles.tbBtnActive)}
        title="이모지 삽입"
        type="button"
        aria-expanded={emojiOpen}
        onMouseDown={(e) => {
          e.preventDefault();
          setEmojiOpen((o) => !o);
        }}
        disabled={sending}
      >
        <EmojiIcon size={14} />
      </button>
      {emojiOpen ? (
        <EmojiPickerPopover popoverRef={emojiPopoverRef} onPick={handlePickEmoji} />
      ) : null}
    </div>
  );
}
