"use client";

import { useEffect, useMemo, useState } from "react";
import type { TaskItem, TaskPriority, TaskStatus, User } from "@hanmir/shared";

export type StatusFilter = "open" | "all" | TaskStatus;
export type AssigneeFilter = "all" | "me" | string; // user id
export type PriorityFilter = "all" | TaskPriority;
// 034 — "none" = 마일스톤 미연결 업무만, 그 외 문자열 = milestone id.
export type MilestoneFilter = "all" | "none" | string;
export type SortBy = "due" | "priority" | "title";

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "완료 제외" },
  { value: "all", label: "전체" },
  { value: "todo", label: "할일" },
  { value: "in_progress", label: "진행중" },
  { value: "review", label: "검토중" },
  { value: "on_hold", label: "보류" },
  { value: "done", label: "완료" }
];

export const PRIORITY_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "top", label: "최우선" },
  { value: "high", label: "높음" },
  { value: "normal", label: "보통" },
  { value: "low", label: "낮음" }
];

export const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "due", label: "마감일순" },
  { value: "priority", label: "우선순위순" },
  { value: "title", label: "이름순" }
];

const PRIO_RANK: Record<TaskPriority, number> = { top: 0, high: 1, normal: 2, low: 3 };

export const TASKS_PAGE_SIZE = 50;

export function useTaskFilters(
  tasks: TaskItem[],
  meId: string,
  userById: Map<string, User>
) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [milestoneFilter, setMilestoneFilter] = useState<MilestoneFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("due");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // 필터/검색/정렬이 바뀌면 1페이지로 리셋.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, assigneeFilter, priorityFilter, milestoneFilter, sortBy, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let xs = tasks.slice();
    if (statusFilter === "open") xs = xs.filter((t) => t.status !== "done");
    else if (statusFilter !== "all") xs = xs.filter((t) => t.status === statusFilter);
    if (assigneeFilter === "me") xs = xs.filter((t) => t.assigneeIds.includes(meId));
    else if (assigneeFilter !== "all") xs = xs.filter((t) => t.assigneeIds.includes(assigneeFilter));
    if (priorityFilter !== "all") xs = xs.filter((t) => t.priority === priorityFilter);
    if (milestoneFilter === "none") xs = xs.filter((t) => !t.milestoneId);
    else if (milestoneFilter !== "all") xs = xs.filter((t) => t.milestoneId === milestoneFilter);
    if (q) xs = xs.filter((t) => t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q));
    xs.sort((a, b) => {
      if (sortBy === "due") {
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      }
      if (sortBy === "priority") {
        return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
      }
      return a.title.localeCompare(b.title);
    });
    return xs;
  }, [tasks, statusFilter, assigneeFilter, priorityFilter, milestoneFilter, sortBy, search, meId]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / TASKS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () =>
      filtered.length > TASKS_PAGE_SIZE
        ? filtered.slice((safePage - 1) * TASKS_PAGE_SIZE, safePage * TASKS_PAGE_SIZE)
        : filtered,
    [filtered, safePage]
  );

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "전체";
  const assigneeLabel =
    assigneeFilter === "all"
      ? "전체"
      : assigneeFilter === "me"
      ? "나"
      : userById.get(assigneeFilter)?.name ?? "선택";
  const priorityLabel =
    PRIORITY_OPTIONS.find((o) => o.value === priorityFilter)?.label ?? "전체";
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "마감일순";

  return {
    statusFilter,
    setStatusFilter,
    assigneeFilter,
    setAssigneeFilter,
    priorityFilter,
    setPriorityFilter,
    milestoneFilter,
    setMilestoneFilter,
    sortBy,
    setSortBy,
    search,
    setSearch,
    filtered,
    paged,
    page: safePage,
    pageCount,
    setPage,
    statusLabel,
    assigneeLabel,
    priorityLabel,
    sortLabel
  };
}
