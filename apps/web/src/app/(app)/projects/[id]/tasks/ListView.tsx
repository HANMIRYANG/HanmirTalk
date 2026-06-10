"use client";

import type { TaskItem, TaskStatus, User } from "@hanmir/shared";
import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import { TaskRow } from "./TaskRow";
import { TaskCreateButton } from "./TaskCreateButton";
import { resolveAssignees } from "./taskViewUtils";
import styles from "./tasks.module.css";

interface ListViewProps {
  tasks: TaskItem[];
  doneCount: number;
  done: TaskItem[];
  doneOpen: boolean;
  onToggleDone: () => void;
  userById: Map<string, User>;
  projectId: string;
  users: User[];
}

export function ListView({
  tasks,
  doneCount,
  done,
  doneOpen,
  onToggleDone,
  userById,
  projectId,
  users
}: ListViewProps) {
  const delayed = tasks.filter((t) => t.dueState === "late" && t.status !== "done");
  const inProgress = tasks.filter(
    (t) => t.status === "in_progress" && t.dueState !== "late"
  );
  const todo = tasks.filter((t) => t.status === "todo");

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
