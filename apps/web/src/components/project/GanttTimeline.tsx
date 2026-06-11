"use client";

import { Avatar } from "@/components/ui/Avatar";
import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import styles from "./GanttTimeline.module.css";

export type GanttRow =
  | {
      kind: "group";
      label: string;
      progress: string;
      from: number;
      to: number;
      indent?: boolean;
    }
  | {
      kind: "task";
      label: string;
      taskId: string;
      assigneeInitials: string;
      assigneeTone?: "default" | "orange" | "green" | "purple" | "gray";
      progressLabel: string;
      progressColor?: string;
      from: number;
      to: number;
      state: "done" | "progress" | "late" | "pending";
      progress?: number;
    }
  | {
      kind: "milestone";
      label: string;
      day: number;
    };

interface GanttTimelineProps {
  startDate: Date;
  totalDays: number;
  todayIndex: number;
  rows: GanttRow[];
  colWidth?: number;
}

export function GanttTimeline({
  startDate,
  totalDays,
  todayIndex,
  rows,
  colWidth = 36
}: GanttTimelineProps) {
  const days: Date[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push(d);
  }

  // group days by month for header bands
  const monthBands: { width: number; label: string }[] = [];
  let i = 0;
  while (i < totalDays) {
    const m = days[i].getMonth();
    let span = 0;
    while (i + span < totalDays && days[i + span].getMonth() === m) span++;
    monthBands.push({ width: span * colWidth, label: `${m + 1}월 ${days[i].getFullYear()}` });
    i += span;
  }

  return (
    <div className={styles.gantt} style={{ ["--col-w" as never]: `${colWidth}px` }}>
      <div className={styles.labels}>
        <div className={styles.labelsHead}>업무 / 마일스톤</div>
        {rows.map((row, idx) => {
          if (row.kind === "milestone") {
            return (
              <div key={idx} className={styles.labelRow}>
                <span className={styles.chev}>
                  <ChevronDownIcon size={10} />
                </span>
                <div className={cn(styles.labelName, styles.labelGroup, styles.labelMilestone)}>
                  ⬥ {row.label}
                </div>
                <div />
                <div className={styles.labelProg}>—</div>
              </div>
            );
          }
          if (row.kind === "group") {
            return (
              <div key={idx} className={styles.labelRow}>
                <span className={styles.chev}>
                  <ChevronDownIcon size={10} />
                </span>
                <div className={cn(styles.labelName, styles.labelGroup)}>{row.label}</div>
                <div />
                <div className={styles.labelProg}>{row.progress}</div>
              </div>
            );
          }
          return (
            <div key={idx} className={cn(styles.labelRow, styles.labelIndent)}>
              <span className={styles.chev} />
              <div className={styles.labelName}>
                {row.label}
                <span className={styles.labelTaskId}>{row.taskId}</span>
              </div>
              <div className={styles.labelAvatar}>
                <Avatar
                  initials={row.assigneeInitials}
                  tone={row.assigneeTone ?? "default"}
                  className={styles.labelAvatarInner}
                />
              </div>
              <div className={styles.labelProg} style={{ color: row.progressColor }}>
                {row.progressLabel}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.timelineWrap}>
        <div
          className={styles.timeline}
          style={{ minWidth: colWidth * totalDays }}
        >
          <div className={styles.months}>
            {monthBands.map((b, idx) => (
              <div key={idx} className={styles.month} style={{ width: b.width }}>
                {b.label}
              </div>
            ))}
          </div>
          <div className={styles.daysRow}>
            {days.map((d, idx) => {
              const dow = d.getDay();
              // 좁은 컬럼(월/분기 스케일)에서는 숫자가 겹치므로 월요일만 표기.
              const showNumber = colWidth >= 22 || dow === 1;
              return (
                <div
                  key={idx}
                  className={cn(
                    styles.day,
                    dow === 1 && styles.dayMon,
                    (dow === 0 || dow === 6) && styles.dayWeekend,
                    idx === todayIndex && styles.dayToday
                  )}
                >
                  {showNumber ? d.getDate() : ""}
                </div>
              );
            })}
          </div>

          <div className={styles.rows}>
            {rows.map((row, idx) => (
              <div
                key={idx}
                className={cn(
                  styles.row,
                  row.kind === "group" && styles.rowGroup
                )}
              >
                {days.map((d, c) => {
                  const dow = d.getDay();
                  return (
                    <div
                      key={c}
                      className={cn(styles.cell, (dow === 0 || dow === 6) && styles.cellWeekend)}
                    />
                  );
                })}
                {row.kind === "milestone" ? (
                  <div
                    className={styles.diamond}
                    style={{ left: row.day * colWidth + colWidth / 2 - 8 }}
                  />
                ) : null}
                {row.kind !== "milestone" ? (
                  <div
                    className={cn(
                      styles.bar,
                      row.kind === "group" && styles.barGroup,
                      row.kind === "task" && row.state === "done" && styles.barDone,
                      row.kind === "task" && row.state === "progress" && styles.barProgress,
                      row.kind === "task" && row.state === "pending" && styles.barPending,
                      row.kind === "task" && row.state === "late" && styles.barLate
                    )}
                    style={{
                      left: row.from * colWidth + 2,
                      width: (row.to - row.from + 1) * colWidth - 4,
                      ...(row.kind === "task" && row.state === "progress" && row.progress != null
                        ? ({ ["--p" as never]: `${row.progress}%` } as React.CSSProperties)
                        : {})
                    }}
                  >
                    {row.kind === "task" ? barText(row.state, row.progress) : ""}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div
            className={styles.todayLine}
            style={{ left: todayIndex * colWidth + colWidth / 2 }}
          />
        </div>
      </div>
    </div>
  );
}

function barText(state: "done" | "progress" | "late" | "pending", progress?: number) {
  if (state === "done") return "완료";
  if (state === "progress") return `${progress ?? 0}%`;
  if (state === "late") return `지연 · ${progress ?? 0}%`;
  return "대기";
}
