"use client";

import { useState } from "react";
import { cn } from "@/lib/classNames";
import styles from "./gantt.module.css";

type Scale = "day" | "week" | "month" | "quarter";
type Period = "current" | "next" | "prev" | "all";
type AssigneeFilter = "all" | "me";
type StatusFilter = "all" | "open" | "done" | "late";

export function GanttToolbar() {
  const [scale, setScale] = useState<Scale>("week");
  const [period, setPeriod] = useState<Period>("current");
  const [assignee, setAssignee] = useState<AssigneeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("open");

  const periodLabel =
    period === "current" ? "5월 — 6월" : period === "next" ? "7월 — 8월" : period === "prev" ? "3월 — 4월" : "전체";
  const assigneeLabel = assignee === "me" ? "나" : "전체";
  const statusLabel =
    status === "all"
      ? "전체"
      : status === "done"
      ? "완료만"
      : status === "late"
      ? "지연만"
      : "완료 제외";

  return (
    <div className={styles.toolbar}>
      <div className={styles.seg}>
        {(["day", "week", "month", "quarter"] as Scale[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScale(s)}
            className={cn(styles.segBtn, scale === s && styles.segActive)}
          >
            {s === "day" ? "일" : s === "week" ? "주" : s === "month" ? "월" : "분기"}
          </button>
        ))}
      </div>

      <div className={styles.filterSlot}>
        <span className={styles.filterLabel}>
          기간: <b>{periodLabel}</b>
        </span>
        <select
          className={styles.nativeSelect}
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          aria-label="기간 필터"
        >
          <option value="prev">3월 — 4월</option>
          <option value="current">5월 — 6월</option>
          <option value="next">7월 — 8월</option>
          <option value="all">전체</option>
        </select>
      </div>

      <div className={styles.filterSlot}>
        <span className={styles.filterLabel}>
          담당자: <b>{assigneeLabel}</b>
        </span>
        <select
          className={styles.nativeSelect}
          value={assignee}
          onChange={(e) => setAssignee(e.target.value as AssigneeFilter)}
          aria-label="담당자 필터"
        >
          <option value="all">전체</option>
          <option value="me">나</option>
        </select>
      </div>

      <div className={styles.filterSlot}>
        <span className={styles.filterLabel}>
          상태: <b>{statusLabel}</b>
        </span>
        <select
          className={styles.nativeSelect}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          aria-label="상태 필터"
        >
          <option value="open">완료 제외</option>
          <option value="all">전체</option>
          <option value="done">완료만</option>
          <option value="late">지연만</option>
        </select>
      </div>

      <div className={styles.legend}>
        <span>
          <span className={styles.dot} style={{ background: "var(--success)" }} />
          완료
        </span>
        <span>
          <span className={styles.dot} style={{ background: "var(--brand-blue)" }} />
          진행중
        </span>
        <span>
          <span className={styles.dot} style={{ background: "#B9BEC6" }} />
          대기
        </span>
        <span>
          <span className={styles.dot} style={{ background: "var(--danger)" }} />
          지연
        </span>
        <span>
          <span
            className={styles.dot}
            style={{
              background: "var(--brand-orange)",
              transform: "rotate(45deg)",
              width: 8,
              height: 8
            }}
          />
          마일스톤
        </span>
      </div>
    </div>
  );
}

export function GanttPdfButton() {
  return (
    <button
      type="button"
      className="btn btn--outline btn--sm"
      onClick={() => window.print()}
      title="브라우저 인쇄 → PDF로 저장"
    >
      PDF 내보내기
    </button>
  );
}
