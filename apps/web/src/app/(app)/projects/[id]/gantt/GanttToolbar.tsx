"use client";

import { cn } from "@/lib/classNames";
import styles from "./gantt.module.css";

export type Scale = "day" | "week" | "month" | "quarter";
export type Period = "all" | "prev" | "current" | "next";
export type AssigneeFilter = "all" | "me";
export type StatusFilter = "all" | "open" | "done" | "late";

interface Props {
  scale: Scale;
  onScaleChange: (scale: Scale) => void;
  period: Period;
  onPeriodChange: (period: Period) => void;
  periodLabels: Record<Period, string>;
  assignee: AssigneeFilter;
  onAssigneeChange: (assignee: AssigneeFilter) => void;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
}

export function GanttToolbar({
  scale,
  onScaleChange,
  period,
  onPeriodChange,
  periodLabels,
  assignee,
  onAssigneeChange,
  status,
  onStatusChange
}: Props) {
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
            onClick={() => onScaleChange(s)}
            className={cn(styles.segBtn, scale === s && styles.segActive)}
          >
            {s === "day" ? "일" : s === "week" ? "주" : s === "month" ? "월" : "분기"}
          </button>
        ))}
      </div>

      <div className={styles.filterSlot}>
        <span className={styles.filterLabel}>
          기간: <b>{periodLabels[period]}</b>
        </span>
        <select
          className={styles.nativeSelect}
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as Period)}
          aria-label="기간 필터"
        >
          <option value="all">{periodLabels.all}</option>
          <option value="prev">{periodLabels.prev}</option>
          <option value="current">{periodLabels.current}</option>
          <option value="next">{periodLabels.next}</option>
        </select>
      </div>

      <div className={styles.filterSlot}>
        <span className={styles.filterLabel}>
          담당자: <b>{assigneeLabel}</b>
        </span>
        <select
          className={styles.nativeSelect}
          value={assignee}
          onChange={(e) => onAssigneeChange(e.target.value as AssigneeFilter)}
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
          onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
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
