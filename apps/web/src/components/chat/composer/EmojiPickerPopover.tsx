"use client";

import type { RefObject } from "react";
import styles from "../MessageComposer.module.css";

// Phase 10 — 큐레이션 이모지. 외부 라이브러리 없이 사내 메신저 맥락에
// 자주 쓸 만한 것만. 3그룹으로 묶어 popover 한 화면에 들어오는 크기 유지.
const EMOJI_GROUPS: { label: string; items: string[] }[] = [
  { label: "업무", items: ["👍", "✅", "🙏", "🎉", "🔥", "👀", "💬", "📌"] },
  { label: "감정", items: ["😀", "😄", "😂", "😊", "😮", "😢", "😡"] },
  { label: "자료", items: ["📎", "📄", "📊", "🧪", "🏭", "🚚", "⚠️"] }
];

interface EmojiPickerPopoverProps {
  popoverRef: RefObject<HTMLDivElement>;
  onPick: (emoji: string) => void;
}

// 이모지 popover. 열림 토글/외부클릭 닫기는 호출부(ComposerToolbar)가
// 갖고, 여기서는 그룹별 그리드 렌더만 담당한다. picker 가 열려도
// textarea 포커스를 유지하기 위해 mousedown 에서 preventDefault.
export function EmojiPickerPopover({ popoverRef, onPick }: EmojiPickerPopoverProps) {
  return (
    <div
      ref={popoverRef}
      className={styles.emojiPopover}
      role="dialog"
      aria-label="이모지 선택"
    >
      {EMOJI_GROUPS.map((group) => (
        <div key={group.label} className={styles.emojiGroup}>
          <div className={styles.emojiGroupLabel}>{group.label}</div>
          <div className={styles.emojiGrid}>
            {group.items.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.emojiBtn}
                title={emoji}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
