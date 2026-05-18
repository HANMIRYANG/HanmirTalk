"use client";

import { useMemo, useState } from "react";
import type { TaskItem, TaskPriority, TaskStatus, User } from "@hanmir/shared";
import { taskPriorityLabel, taskStatusLabel } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ChevronDownIcon, SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import { TaskRow } from "./TaskRow";
import { TaskCreateButton } from "./TaskCreateButton";
import styles from "./tasks.module.css";

type ViewMode = "list" | "board" | "timeline" | "table";
type StatusFilter = "open" | "all" | TaskStatus;
type AssigneeFilter = "all" | "me" | string; // user id
type PriorityFilter = "all" | TaskPriority;
type SortBy = "due" | "priority" | "title";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "완료 제외" },
  { value: "all", label: "전체" },
  { value: "todo", label: "할일" },
  { value: "in_progress", label: "진행중" },
  { value: "review", label: "검토중" },
  { value: "on_hold", label: "보류" },
  { value: "done", label: "완료" }
];

const PRIORITY_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "top", label: "최우선" },
  { value: "high", label: "높음" },
  { value: "normal", label: "보통" },
  { value: "low", label: "낮음" }
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "due", label: "마감일순" },
  { value: "priority", label: "우선순위순" },
  { value: "title", label: "이름순" }
];

const STATUS_TONE: Record<TaskStatus, "blue" | "amber" | "red" | "default" | "green"> = {
  todo: "default",
  in_progress: "blue",
  review: "amber",
  done: "green",
  on_hold: "amber"
};

const PRIO_TONE: Record<string, "red" | "amber" | "default"> = {
  top: "red",
  high: "amber",
  normal: "default",
  low: "default"
};

const PRIO_RANK: Record<TaskPriority, number> = { top: 0, high: 1, normal: 2, low: 3 };

const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "할일" },
  { status: "in_progress", label: "진행중" },
  { status: "review", label: "검토중" },
  { status: "on_hold", label: "보류" },
  { status: "done", label: "완료" }
];

interface TasksWorkspaceProps {
  projectId: string;
  doneCount: number;
  tasks: TaskItem[];
  users: User[];
  meId: string;
}

function resolveAssignees(task: TaskItem, userById: Map<string, User>): User[] {
  const out: User[] = [];
  for (const id of task.assigneeIds) {
    const user = userById.get(id);
    if (user) out.push(user);
  }
  return out;
}

function downloadCsv(tasks: TaskItem[], userById: Map<string, User>) {
  const headers = ["코드", "제목", "상태", "우선순위", "담당자", "마감일", "진행률"];
  const rows = tasks.map((t) => [
    t.code,
    t.title.replace(/"/g, '""'),
    taskStatusLabel[t.status],
    taskPriorityLabel[t.priority],
    t.assigneeIds
      .map((id) => userById.get(id)?.name ?? id)
      .join("; "),
    t.dueDate ?? "",
    `${t.progress}%`
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v)}"`).join(","))
    .join("\n");
  // Prepend UTF-8 BOM so Excel opens Korean text correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tasks-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TasksWorkspace({
  projectId,
  doneCount,
  tasks,
  users,
  meId
}: TasksWorkspaceProps) {
  const [view, setView] = useState<ViewMode>("list");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("due");
  const [search, setSearch] = useState("");
  const [doneOpen, setDoneOpen] = useState(false);

  const userById = useMemo(
    () => new Map(users.map((u) => [u.id, u] as const)),
    [users]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let xs = tasks.slice();
    if (statusFilter === "open") xs = xs.filter((t) => t.status !== "done");
    else if (statusFilter !== "all") xs = xs.filter((t) => t.status === statusFilter);
    if (assigneeFilter === "me") xs = xs.filter((t) => t.assigneeIds.includes(meId));
    else if (assigneeFilter !== "all") xs = xs.filter((t) => t.assigneeIds.includes(assigneeFilter));
    if (priorityFilter !== "all") xs = xs.filter((t) => t.priority === priorityFilter);
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
  }, [tasks, statusFilter, assigneeFilter, priorityFilter, sortBy, search, meId]);

  const delayed = filtered.filter((t) => t.dueState === "late" && t.status !== "done");
  const inProgress = filtered.filter(
    (t) => t.status === "in_progress" && t.dueState !== "late"
  );
  const todo = filtered.filter((t) => t.status === "todo");
  const done = tasks.filter((t) => t.status === "done"); // 완료는 필터 무시하고 별도

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
            delayed={delayed}
            inProgress={inProgress}
            todo={todo}
            doneCount={doneCount}
            done={done}
            doneOpen={doneOpen}
            onToggleDone={() => setDoneOpen((v) => !v)}
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
          <TimelineView tasks={filtered} userById={userById} />
        ) : (
          <TableView tasks={filtered} userById={userById} onCsv={() => downloadCsv(filtered, userById)} />
        )}
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

function ListView({
  delayed,
  inProgress,
  todo,
  doneCount,
  done,
  doneOpen,
  onToggleDone,
  userById,
  projectId,
  users
}: {
  delayed: TaskItem[];
  inProgress: TaskItem[];
  todo: TaskItem[];
  doneCount: number;
  done: TaskItem[];
  doneOpen: boolean;
  onToggleDone: () => void;
  userById: Map<string, User>;
  projectId: string;
  users: User[];
}) {
  return (
    <div className={styles.tblWrap}>
      <TaskGroup
        label="지연 업무"
        count={delayed.length}
        accent="danger"
        tasks={delayed}
        userById={userById}
        projectId={projectId}
        users={users}
        createDefaultStatus="in_progress"
        showThead
      />
      <TaskGroup
        label="진행중"
        count={inProgress.length}
        tasks={inProgress}
        userById={userById}
        projectId={projectId}
        users={users}
        createDefaultStatus="in_progress"
      />
      <TaskGroup
        label="대기"
        count={todo.length}
        tasks={todo}
        userById={userById}
        projectId={projectId}
        users={users}
        createDefaultStatus="todo"
      />

      <button
        type="button"
        onClick={onToggleDone}
        className={styles.groupHead}
        style={{
          borderTop: "1px solid var(--border-soft)",
          width: "100%",
          textAlign: "left",
          background: "var(--surface-muted)"
        }}
      >
        <span
          style={{
            display: "inline-block",
            transform: doneOpen ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.1s ease"
          }}
        >
          <ChevronDownIcon size={12} />
        </span>
        <div className={styles.groupLabel}>
          완료
          <span className={cn(styles.groupCount, styles.groupCountSuccess)}>
            {doneCount}
          </span>
        </div>
        <span className="muted t-xs" style={{ marginLeft: "auto", marginRight: 8 }}>
          {doneOpen ? "접기" : "펼치기"}
        </span>
      </button>
      {doneOpen ? (
        <table className={styles.tasks}>
          <colgroup>
            <col className={styles.colCheck} />
            <col />
            <col className={styles.colStatus} />
            <col className={styles.colAssign} />
            <col className={styles.colDue} />
            <col className={styles.colProgress} />
            <col className={styles.colPriority} />
          </colgroup>
          <tbody>
            {done.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--text-4)", padding: 16 }}>
                  완료된 업무가 없습니다.
                </td>
              </tr>
            ) : (
              done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  assignees={resolveAssignees(t, userById)}
                />
              ))
            )}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function TaskGroup({
  label,
  count,
  accent,
  tasks,
  userById,
  projectId,
  users,
  createDefaultStatus,
  showThead
}: {
  label: string;
  count: number;
  accent?: "danger";
  tasks: TaskItem[];
  userById: Map<string, User>;
  projectId: string;
  users: User[];
  createDefaultStatus: TaskStatus;
  showThead?: boolean;
}) {
  return (
    <>
      <div className={styles.groupHead}>
        <ChevronDownIcon size={12} />
        <div className={styles.groupLabel}>
          {label}
          <span
            className={cn(styles.groupCount, accent === "danger" && styles.groupCountDanger)}
          >
            {count}
          </span>
        </div>
        <TaskCreateButton
          projectId={projectId}
          users={users}
          defaultStatus={createDefaultStatus}
          className={styles.groupAdd}
        />
      </div>
      <table className={styles.tasks}>
        <colgroup>
          <col className={styles.colCheck} />
          <col />
          <col className={styles.colStatus} />
          <col className={styles.colAssign} />
          <col className={styles.colDue} />
          <col className={styles.colProgress} />
          <col className={styles.colPriority} />
        </colgroup>
        {showThead ? (
          <thead>
            <tr>
              <th />
              <th>업무명</th>
              <th>상태</th>
              <th>담당자</th>
              <th>마감일</th>
              <th>진행률</th>
              <th>우선순위</th>
            </tr>
          </thead>
        ) : null}
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "var(--text-4)", padding: 16 }}>
                해당하는 업무가 없습니다.
              </td>
            </tr>
          ) : (
            tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                assignees={resolveAssignees(t, userById)}
              />
            ))
          )}
        </tbody>
      </table>
    </>
  );
}

function BoardView({
  tasks,
  userById
}: {
  tasks: TaskItem[];
  userById: Map<string, User>;
}) {
  return (
    <div className={styles.board}>
      {BOARD_COLUMNS.map((col) => {
        const list = tasks.filter((t) => t.status === col.status);
        return (
          <div key={col.status} className={styles.boardCol}>
            <div className={styles.boardColHead}>
              <span className={styles.boardColLabel}>{col.label}</span>
              <span className={styles.boardColCount}>{list.length}</span>
            </div>
            <div className={styles.boardColBody}>
              {list.length === 0 ? (
                <div className={styles.boardEmpty}>없음</div>
              ) : (
                list.map((t) => (
                  <div key={t.id} className={styles.boardCard}>
                    <div className={styles.boardCardTitle}>{t.title}</div>
                    <div className={styles.boardCardMeta}>
                      <span className={styles.boardCardCode}>{t.code}</span>
                      <Tag tone={PRIO_TONE[t.priority]}>{taskPriorityLabel[t.priority]}</Tag>
                    </div>
                    <ProgressBar value={t.progress} className={styles.boardCardProgress} />
                    <div className={styles.boardCardFoot}>
                      <span>{t.dueLabel}</span>
                      <div className={styles.assignees}>
                        {resolveAssignees(t, userById).slice(0, 3).map((u) => (
                          <Avatar
                            key={u.id}
                            initials={u.initials}
                            tone={u.avatarTone ?? "default"}
                            className={styles.assigneeAvatar}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineView({
  tasks,
  userById
}: {
  tasks: TaskItem[];
  userById: Map<string, User>;
}) {
  const byDate = [...tasks].sort((a, b) =>
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
  );
  return (
    <div className={styles.timeline}>
      {byDate.length === 0 ? (
        <div className={styles.empty}>표시할 업무가 없습니다.</div>
      ) : (
        byDate.map((t) => (
          <div key={t.id} className={styles.timelineRow}>
            <div className={styles.timelineDate}>{t.dueLabel}</div>
            <div className={styles.timelineCard}>
              <div className={styles.timelineHead}>
                <Tag tone={STATUS_TONE[t.status]} dot>
                  {taskStatusLabel[t.status]}
                </Tag>
                <span className={styles.timelineTitle}>{t.title}</span>
                <span className={styles.timelineCode}>{t.code}</span>
              </div>
              <div className={styles.timelineMeta}>
                <ProgressBar value={t.progress} className={styles.timelineProgress} />
                <span>{t.progress}%</span>
                <div className={styles.assignees}>
                  {resolveAssignees(t, userById).map((u) => (
                    <Avatar
                      key={u.id}
                      initials={u.initials}
                      tone={u.avatarTone ?? "default"}
                      className={styles.assigneeAvatar}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TableView({
  tasks,
  userById,
  onCsv
}: {
  tasks: TaskItem[];
  userById: Map<string, User>;
  onCsv: () => void;
}) {
  return (
    <div className={styles.tblWrap}>
      <div className={styles.tableTopBar}>
        <span className="muted t-xs">{tasks.length}건 표시</span>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={onCsv}
          style={{ marginLeft: "auto" }}
        >
          CSV 내보내기
        </button>
      </div>
      <table className={styles.tasks}>
        <thead>
          <tr>
            <th>코드</th>
            <th>제목</th>
            <th>상태</th>
            <th>우선순위</th>
            <th>담당자</th>
            <th>마감일</th>
            <th>진행률</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "var(--text-4)", padding: 16 }}>
                표시할 업무가 없습니다.
              </td>
            </tr>
          ) : (
            tasks.map((t) => (
              <tr key={t.id}>
                <td className={styles.tableCode}>{t.code}</td>
                <td className={styles.tableTitle}>{t.title}</td>
                <td>
                  <Tag tone={STATUS_TONE[t.status]} dot>
                    {taskStatusLabel[t.status]}
                  </Tag>
                </td>
                <td>
                  <Tag tone={PRIO_TONE[t.priority]}>{taskPriorityLabel[t.priority]}</Tag>
                </td>
                <td>
                  <div className={styles.assignees}>
                    {resolveAssignees(t, userById).map((u) => (
                      <Avatar
                        key={u.id}
                        initials={u.initials}
                        tone={u.avatarTone ?? "default"}
                        className={styles.assigneeAvatar}
                      />
                    ))}
                  </div>
                </td>
                <td>{t.dueLabel}</td>
                <td>
                  <div className={styles.progressCell}>
                    <ProgressBar value={t.progress} className={styles.progressBar} />
                    <span className={styles.progressVal}>{t.progress}%</span>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
