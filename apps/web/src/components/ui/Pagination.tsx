"use client";

import styles from "./Pagination.module.css";

interface PaginationProps {
  page: number; // 1-base
  pageCount: number;
  onChange: (page: number) => void;
}

// 페이지 번호 윈도잉: 1 … (p-1) p (p+1) … last
function pageWindow(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pageCount - 1) out.push("…");
  out.push(pageCount);
  return out;
}

// 공용 페이지네이션 컨트롤 — pageCount <= 1 이면 렌더하지 않는다.
export function Pagination({ page, pageCount, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;
  const go = (p: number) => onChange(Math.min(Math.max(1, p), pageCount));
  return (
    <nav className={styles.pagination} aria-label="페이지">
      <button
        type="button"
        className={styles.pageBtn}
        onClick={() => go(page - 1)}
        disabled={page <= 1}
      >
        이전
      </button>
      {pageWindow(page, pageCount).map((p, i) =>
        p === "…" ? (
          <span key={`e-${i}`} className={styles.ellipsis}>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={p === page ? styles.pageBtnActive : styles.pageBtn}
            aria-current={p === page ? "page" : undefined}
            onClick={() => go(p)}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        className={styles.pageBtn}
        onClick={() => go(page + 1)}
        disabled={page >= pageCount}
      >
        다음
      </button>
    </nav>
  );
}
