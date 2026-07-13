"use client";

import { useMemo, useState } from "react";
import type { Milestone, TaskItem, User } from "@hanmir/shared";
import { ChevronDownIcon, SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import {
  PRIORITY_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  useTaskFilters,
  type AssigneeFilter,
  type MilestoneFilter,
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
import { TaskCreateModal } from "./TaskCreateModal";
import styles from "./tasks.module.css";

type ViewMode = "list" | "board" | "timeline" | "table";

interface TasksWorkspaceProps {
  projectId: string;
  doneCount: number;
  tasks: TaskItem[];
  users: User[];
  milestones: Milestone[];
  meId: string;
}

export function TasksWorkspace({
  projectId,
  doneCount,
  tasks,
  users,
  milestones,
  meId
}: TasksWorkspaceProps) {
  const [view, setView] = useState<ViewMode>("list");
  // 033 — 목록 행의 [+하위] 로 여는 하위 업무 추가 모달의 부모 업무.
  const [subtaskParent, setSubtaskParent] = useState<TaskItem | null>(null);

  const userById = useMemo(
    () => new Map(users.map((u) => [u.id, u] as const)),
    [users]
  );
  const milestoneNameById = useMemo(
    () => new Map(milestones.map((m) => [m.id, m.title] as const)),
    [milestones]
  );

  const {
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
        {milestones.length > 0 ? (
          <FilterSelect
            label="마일스톤"
            value={
              milestoneFilter === "all"
                ? "전체"
                : milestoneFilter === "none"
                ? "미연결"
                : milestoneNameById.get(milestoneFilter) ?? "선택"
            }
            render={() => (
              <select
                className={styles.nativeSelect}
                value={milestoneFilter}
                onChange={(e) => setMilestoneFilter(e.target.value as MilestoneFilter)}
                aria-label="마일스톤 필터"
              >
                <option value="all">전체</option>
                <option value="none">미연결</option>
                <optgroup label="마일스톤">
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </optgroup>
              </select>
            )}
          />
        ) : null}
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
            tasks={filtered}
            doneCount={doneCount}
            done={done}
            allTasks={tasks}
            userById={userById}
            milestoneNameById={milestoneNameById}
            onAddSubtask={setSubtaskParent}
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
        {/* 목록 뷰는 그룹별 5건 페이지네이션, 보드 뷰는 컬럼별 자연
            스크롤 — 전역 페이지네이션은 타임라인/표 뷰에서만 쓴다. */}
        {view === "timeline" || view === "table" ? (
          <TasksPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        ) : null}
      </div>

      <TaskCreateModal
        open={subtaskParent !== null}
        onClose={() => setSubtaskParent(null)}
        projectId={projectId}
        users={users}
        milestones={milestones}
        parentTask={subtaskParent}
      />
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
