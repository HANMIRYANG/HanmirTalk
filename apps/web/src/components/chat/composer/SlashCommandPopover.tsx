"use client";

import type { AiCommand } from "@/services/ai.service";
import { cn } from "@/lib/classNames";
import type { SlashCommandItem } from "./useSlashCommands";
import styles from "../MessageComposer.module.css";

interface SlashCommandPopoverProps {
  matches: SlashCommandItem[];
  activeIndex: number;
  onPick: (command: AiCommand) => void;
  onHover: (index: number) => void;
}

// 슬래시 명령 popover. 열림/닫힘 조건과 후보 필터링은 호출부가 갖고,
// 여기서는 매치된 명령 목록 렌더만 담당한다.
export function SlashCommandPopover({
  matches,
  activeIndex,
  onPick,
  onHover
}: SlashCommandPopoverProps) {
  return (
    <div className={styles.mentionPopover} role="listbox" aria-label="AI 명령">
      {matches.map((c, i) => (
        <button
          key={c.command}
          type="button"
          className={cn(
            styles.mentionRow,
            i === activeIndex && styles.mentionRowActive
          )}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(c.command);
          }}
          role="option"
          aria-selected={i === activeIndex}
        >
          <span className={styles.mentionTypeIcon}>✨</span>
          <div className={styles.mentionMeta}>
            <div className={styles.mentionLabel}>{c.trigger}</div>
            <div className={styles.mentionSublabel}>{c.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
