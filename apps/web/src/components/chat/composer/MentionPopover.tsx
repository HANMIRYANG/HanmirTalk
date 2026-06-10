"use client";

import type { MentionSearchResult } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/classNames";
import styles from "../MessageComposer.module.css";

interface MentionPopoverProps {
  results: MentionSearchResult[];
  activeIndex: number;
  onPick: (result: MentionSearchResult) => void;
  onHover: (index: number) => void;
}

// 멘션 검색 결과 popover. 열림/닫힘 조건은 호출부(picker state)가 갖고,
// 여기서는 결과 목록 렌더만 담당한다.
export function MentionPopover({ results, activeIndex, onPick, onHover }: MentionPopoverProps) {
  return (
    <div className={styles.mentionPopover} role="listbox">
      {results.length === 0 ? (
        <div className={styles.mentionEmpty}>
          검색 결과 없음 (계속 입력하거나 Esc로 닫기)
        </div>
      ) : (
        results.map((r, i) => (
          <button
            key={`${r.type}:${r.id}`}
            type="button"
            className={cn(
              styles.mentionRow,
              i === activeIndex && styles.mentionRowActive
            )}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              // mousedown not click — click would steal focus
              // from textarea after blur runs.
              e.preventDefault();
              onPick(r);
            }}
            role="option"
            aria-selected={i === activeIndex}
          >
            {r.initials ? (
              <Avatar
                initials={r.initials}
                tone={r.avatarTone ?? "default"}
                size="sm"
              />
            ) : (
              <span className={styles.mentionTypeIcon}>
                {r.type === "department"
                  ? "🏢"
                  : r.type === "project"
                  ? "📁"
                  : r.type === "task"
                  ? "✅"
                  : r.type === "file"
                  ? "📄"
                  : "@"}
              </span>
            )}
            <div className={styles.mentionMeta}>
              <div className={styles.mentionLabel}>{r.label}</div>
              {r.sublabel ? (
                <div className={styles.mentionSublabel}>{r.sublabel}</div>
              ) : null}
            </div>
          </button>
        ))
      )}
    </div>
  );
}
