"use client";

import { cn } from "@/lib/classNames";
import styles from "./tasks.module.css";

interface TasksPaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  // 그룹 내 페이지네이션 등 배치별 여백 조정용.
  className?: string;
}

/** "1 2 3 … 12" 형태의 페이지 번호 목록 (현재 페이지 주변 + 양 끝, 간격은 말줄임). */
function buildPageItems(page: number, pageCount: number): (number | "ellipsis")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const anchors = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  const items: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of anchors) {
    if (prev > 0) {
      if (p - prev === 2) items.push(prev + 1);
      else if (p - prev > 2) items.push("ellipsis");
    }
    items.push(p);
    prev = p;
  }
  return items;
}

export function TasksPagination({
  page,
  pageCount,
  onPageChange,
  className
}: TasksPaginationProps) {
  if (pageCount <= 1) return null;
  const items = buildPageItems(page, pageCount);
  return (
    <nav className={cn(styles.pagination, className)} aria-label="페이지 이동">
      <button
        type="button"
        className={styles.pageBtn}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        이전
      </button>
      {items.map((item, i) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className={styles.pageEllipsis} aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={cn(styles.pageBtn, item === page && styles.pageBtnActive)}
            onClick={() => onPageChange(item)}
            aria-current={item === page ? "page" : undefined}
            aria-label={`${item}페이지`}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        className={styles.pageBtn}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
      >
        다음
      </button>
    </nav>
  );
}
