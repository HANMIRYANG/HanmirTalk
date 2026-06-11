"use client";

import { useMemo, useState } from "react";
import type { Milestone, TaskItem, User } from "@hanmir/shared";
import { GanttTimeline, type GanttRow } from "@/components/project/GanttTimeline";
import {
  GanttToolbar,
  type AssigneeFilter,
  type Period,
  type Scale,
  type StatusFilter
} from "./GanttToolbar";
import styles from "./gantt.module.css";

interface Props {
  tasks: TaskItem[];
  milestones: Milestone[];
  users: User[];
  meId: string;
}

const COL_WIDTH: Record<Scale, number> = { day: 48, week: 36, month: 18, quarter: 10 };
const MS_PER_DAY = 86_400_000;
// 차트가 비정상적으로 길어지는 것을 막는 안전 상한 (일 단위).
const MAX_DAYS = 240;
const MIN_DAYS = 14;

type TaskState = "done" | "progress" | "late" | "pending";

// seed/DB 날짜는 "YYYY.MM.DD" — 구분자 변형("-", "/")도 함께 허용.
function parseDate(value?: string): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

function taskState(t: TaskItem): TaskState {
  if (t.status === "done") return "done";
  if (t.dueState === "late") return "late";
  if (t.status === "in_progress" || t.status === "review") return "progress";
  return "pending";
}

function matchesStatus(state: TaskState, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return state !== "done";
  if (filter === "done") return state === "done";
  return state === "late";
}

export function GanttView({ tasks, milestones, users, meId }: Props) {
  const [scale, setScale] = useState<Scale>("week");
  const [period, setPeriod] = useState<Period>("all");
  const [assignee, setAssignee] = useState<AssigneeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("open");

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const { rows, startDate, totalDays, todayIndex, unscheduled, periodLabels } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monthLabel = (offset: number) => {
      const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      return `${d.getMonth() + 1}월`;
    };
    const labels: Record<Period, string> = {
      prev: `지난 달 (${monthLabel(-1)})`,
      current: `이번 달 (${monthLabel(0)})`,
      next: `다음 달 (${monthLabel(1)})`,
      all: "전체"
    };

    // 시작/마감 둘 다 없는 업무는 차트에 배치할 수 없으므로 분리 표시.
    const dated: { task: TaskItem; start: Date; end: Date; state: TaskState }[] = [];
    const unplaced: TaskItem[] = [];
    for (const t of tasks) {
      const s = parseDate(t.startDate);
      const e = parseDate(t.dueDate);
      const start = s ?? e;
      if (!start) {
        unplaced.push(t);
        continue;
      }
      const end = e && e.getTime() >= start.getTime() ? e : start;
      dated.push({ task: t, start, end, state: taskState(t) });
    }

    let visible = dated.filter((d) => matchesStatus(d.state, status));
    if (assignee === "me") {
      visible = visible.filter((d) => d.task.assigneeIds.includes(meId));
    }

    const visibleMilestones = milestones
      .map((m) => ({ milestone: m, date: parseDate(m.date) }))
      .filter((m): m is { milestone: Milestone; date: Date } => m.date !== null);

    // 기간 필터: 해당 월과 겹치는 업무/마일스톤만, 차트 범위도 그 월로 고정.
    let chartStart: Date;
    let chartEnd: Date;
    if (period !== "all") {
      const offset = period === "prev" ? -1 : period === "next" ? 1 : 0;
      chartStart = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      chartEnd = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
      visible = visible.filter((d) => d.end >= chartStart && d.start <= chartEnd);
    } else {
      const points: Date[] = [today];
      for (const d of visible) {
        points.push(d.start, d.end);
      }
      for (const m of visibleMilestones) points.push(m.date);
      const min = points.reduce((a, b) => (b < a ? b : a));
      const max = points.reduce((a, b) => (b > a ? b : a));
      chartStart = addDays(min, -2);
      chartEnd = addDays(max, 5);
    }

    let days = dayDiff(chartStart, chartEnd) + 1;
    if (days > MAX_DAYS) days = MAX_DAYS;
    if (days < MIN_DAYS) days = MIN_DAYS;

    const clampDay = (n: number) => Math.max(0, Math.min(days - 1, n));
    const sortable: { sort: number; row: GanttRow }[] = [];

    for (const { milestone, date } of visibleMilestones) {
      const day = dayDiff(chartStart, date);
      if (day < 0 || day > days - 1) continue;
      sortable.push({ sort: day, row: { kind: "milestone", label: milestone.title, day } });
    }

    for (const { task, start, end, state } of visible) {
      const rawFrom = dayDiff(chartStart, start);
      const rawTo = dayDiff(chartStart, end);
      if (rawTo < 0 || rawFrom > days - 1) continue;
      const from = clampDay(rawFrom);
      const to = clampDay(Math.max(rawFrom, rawTo));
      const firstAssignee = task.assigneeIds.length
        ? usersById.get(task.assigneeIds[0])
        : undefined;
      sortable.push({
        sort: from,
        row: {
          kind: "task",
          label: task.title,
          taskId: task.code,
          assigneeInitials: firstAssignee?.initials || firstAssignee?.name.slice(0, 2) || "—",
          assigneeTone: firstAssignee?.avatarTone ?? "default",
          progressLabel: `${task.progress}%`,
          progressColor: state === "late" ? "var(--danger)" : undefined,
          from,
          to,
          state,
          progress: task.progress
        }
      });
    }

    sortable.sort((a, b) => a.sort - b.sort);

    return {
      rows: sortable.map((s) => s.row),
      startDate: chartStart,
      totalDays: days,
      todayIndex: dayDiff(chartStart, today),
      unscheduled: unplaced,
      periodLabels: labels
    };
  }, [tasks, milestones, usersById, meId, period, assignee, status]);

  return (
    <>
      <GanttToolbar
        scale={scale}
        onScaleChange={setScale}
        period={period}
        onPeriodChange={setPeriod}
        periodLabels={periodLabels}
        assignee={assignee}
        onAssigneeChange={setAssignee}
        status={status}
        onStatusChange={setStatus}
      />

      <div className="content no-pad">
        {unscheduled.length > 0 ? (
          <div className="muted t-sm" style={{ padding: "12px 28px 0" }}>
            일정 미지정 업무 {unscheduled.length}건 (차트 미표시):{" "}
            {unscheduled.map((t) => t.title).join(", ")}
          </div>
        ) : null}
        <div className={styles.ganttWrap}>
          {rows.length === 0 ? (
            <div className="muted t-sm" style={{ padding: 24 }}>
              표시할 업무/마일스톤이 없습니다. 필터를 바꾸거나 업무에 시작일·마감일을
              지정해 보세요.
            </div>
          ) : (
            <GanttTimeline
              startDate={startDate}
              totalDays={totalDays}
              todayIndex={todayIndex}
              rows={rows}
              colWidth={COL_WIDTH[scale]}
            />
          )}
        </div>
      </div>
    </>
  );
}
