"use client";

import { useState, type KeyboardEvent } from "react";
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
  userById: Map<string, User>;
  projectId: string;
  users: User[];
}

export function ListView({
  tasks,
  doneCount,
  done,
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
        emptyText="지연된 업무가 없습니다."
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
        emptyText="진행 중인 업무가 없습니다."
        userById={userById}
        projectId={projectId}
        users={users}
        createDefaultStatus="in_progress"
      />
      <TaskGroup
        label="대기"
        count={todo.length}
        tasks={todo}
        emptyText="대기 중인 업무가 없습니다."
        userById={userById}
        projectId={projectId}
        users={users}
        createDefaultStatus="todo"
      />
      <TaskGroup
        label="완료"
        count={doneCount}
        accent="success"
        tasks={done}
        emptyText="완료된 업무가 없습니다."
        userById={userById}
        projectId={projectId}
        users={users}
        defaultOpen={false}
      />
    </div>
  );
}

// 접기/펼치기 가능한 업무 그룹. 헤더 전체가 토글이고(화살표 회전),
// [+ 추가] 버튼은 이벤트 전파를 막아 토글과 분리한다. 이전 구현은
// 지연/진행중/대기 그룹의 화살표가 장식일 뿐 클릭이 안 됐고 완료만
// 별도 버튼이었다 — 네 그룹을 동일 동작으로 통일.
function TaskGroup({
  label,
  count,
  accent,
  tasks,
  emptyText,
  userById,
  projectId,
  users,
  createDefaultStatus,
  showThead,
  defaultOpen = true
}: {
  label: string;
  count: number;
  accent?: "danger" | "success";
  tasks: TaskItem[];
  emptyText: string;
  userById: Map<string, User>;
  projectId: string;
  users: User[];
  createDefaultStatus?: TaskStatus;
  showThead?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => setOpen((v) => !v);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <>
      <div
        className={styles.groupHead}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span className={cn(styles.groupChevron, !open && styles.groupChevronClosed)}>
          <ChevronDownIcon size={12} />
        </span>
        <div className={styles.groupLabel}>
          {label}
          <span
            className={cn(
              styles.groupCount,
              accent === "danger" && styles.groupCountDanger,
              accent === "success" && styles.groupCountSuccess
            )}
          >
            {count}
          </span>
          <span className="muted t-xs" style={{ fontWeight: 400 }}>
            {open ? "접기" : "펼치기"}
          </span>
        </div>
        {createDefaultStatus ? (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <TaskCreateButton
              projectId={projectId}
              users={users}
              defaultStatus={createDefaultStatus}
              className={styles.groupAdd}
            />
          </span>
        ) : null}
      </div>
      {open ? (
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
                <td
                  colSpan={7}
                  style={{ textAlign: "center", color: "var(--text-4)", padding: 16 }}
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              tasks.map((t) => (
                <TaskRow key={t.id} task={t} assignees={resolveAssignees(t, userById)} />
              ))
            )}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
