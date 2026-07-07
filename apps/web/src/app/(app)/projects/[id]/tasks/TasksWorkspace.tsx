"use client";

import { useMemo, useState } from "react";
import type { TaskItem, User } from "@hanmir/shared";
import { ChevronDownIcon, SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import {
  PRIORITY_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  useTaskFilters,
  type AssigneeFilter,
  type PriorityFilter,
  type SortBy,
  type StatusFilter
} from "./useTaskFilters";
import { downloadCsv } from "./taskViewUtils";
import { ListView } from "./ListView";
import { BoardView } from "./BoardView";
import { TimelineView } from "./TimelineView";
import { TableView } from "./TableView";
import { TasksPagination } from "./TasksPagination";
import styles from "./tasks.module.css";

type ViewMode = "list" | "board" | "timeline" | "table";

interface TasksWorkspaceProps {
  projectId: string;
  doneCount: number;
  tasks: TaskItem[];
  users: User[];
  meId: string;
}

export function TasksWorkspace({
  projectId,
  doneCount,
  tasks,
  users,
  meId
}: TasksWorkspaceProps) {
  const [view, setView] = useState<ViewMode>("list");

  const userById = useMemo(
    () => new Map(users.map((u) => [u.id, u] as const)),
    [users]
  );

  const {
    statusFilter,
    setStatusFilter,
    assigneeFilter,
    setAssigneeFilter,
    priorityFilter,
    setPriorityFilter,
    sortBy,
    setSortBy,
    search,
    setSearch,
    filtered,
    paged,
    page,
    pageCount,
    setPage,
    statusLabel,
    assigneeLabel,
    priorityLabel,
    sortLabel
  } = useTaskFilters(tasks, meId, userById);

  const done = tasks.filter((t) => t.status === "done"); // 완료는 필터 무시하고 별도

  return (
    <>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.seg}>
          {(["list", "board", "timeline", "table"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(styles.segBtn, view === v && styles.segActive)}
            >
              {v === "list" ? "목록" : v === "board" ? "보드" : v === "timeline" ? "타임라인" : "표"}
            </button>
          ))}
        </div>

        <FilterSelect
          label="담당자"
          value={assigneeLabel}
          render={() => (
            <select
              className={styles.nativeSelect}
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value as AssigneeFilter)}
              aria-label="담당자 필터"
            >
              <option value="all">전체</option>
              <option value="me">나</option>
              <optgroup label="사용자">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.departmentName}
                  </option>
                ))}
              </optgroup>
            </select>
          )}
        />
        <FilterSelect
          label="상태"
          value={statusLabel}
          render={() => (
            <select
              className={styles.nativeSelect}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="상태 필터"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        />
        <FilterSelect
          label="우선순위"
          value={priorityLabel}
          render={() => (
            <select
              className={styles.nativeSelect}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
              aria-label="우선순위 필터"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        />
        <FilterSelect
          label="정렬"
          value={sortLabel}
          render={() => (
            <select
              className={styles.nativeSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              aria-label="정렬"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        />

        <div className={styles.right}>
          <div className="search" style={{ width: 220 }}>
            <SearchIcon size={14} />
            <input
              placeholder="업무 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="업무 검색"
            />
          </div>
        </div>
      </div>

      <div className="content no-pad">
        {view === "list" ? (
          <ListView
            tasks={paged}
            doneCount={doneCount}
            done={done}
            userById={userById}
            projectId={projectId}
            users={users}
          />
        ) : view === "board" ? (
          <BoardView
            tasks={filtered}
            userById={userById}
          />
        ) : view === "timeline" ? (
          <TimelineView tasks={paged} userById={userById} />
        ) : (
          <TableView tasks={paged} userById={userById} onCsv={() => downloadCsv(filtered, userById)} />
        )}
        {/* 보드 뷰는 컬럼별 자연 스크롤 유지 — 페이지네이션 제외 */}
        {view !== "board" ? (
          <TasksPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        ) : null}
      </div>
    </>
  );
}

function FilterSelect({
  label,
  value,
  render
}: {
  label: string;
  value: string;
  render: () => JSX.Element;
}) {
  return (
    <div className={styles.filterSlot}>
      <span className={styles.filterLabel}>
        {label}: <b>{value}</b>
      </span>
      <ChevronDownIcon size={10} />
      {render()}
    </div>
  );
}
