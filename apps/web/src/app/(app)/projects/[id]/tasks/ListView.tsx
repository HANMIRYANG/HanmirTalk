"use client";

import { useState, type KeyboardEvent } from "react";
import type { TaskItem, User } from "@hanmir/shared";
import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import { TaskRow } from "./TaskRow";
import { TasksPagination } from "./TasksPagination";
import { resolveAssignees } from "./taskViewUtils";
import styles from "./tasks.module.css";

// 그룹당 페이지 크기 — 각 상태 그룹이 5건 단위로 자체 페이지네이션한다.
// (033 이후 페이지 단위는 상위 업무 기준 — 하위 업무는 부모에 붙어 렌더)
const GROUP_PAGE_SIZE = 5;

interface ListViewProps {
  tasks: TaskItem[];
  doneCount: number;
  done: TaskItem[];
  // 필터와 무관한 전체 목록 — 하위 업무를 부모 밑에 붙이기 위한 원본.
  allTasks: TaskItem[];
  userById: Map<string, User>;
  onAddSubtask?: (task: TaskItem) => void;
}

// 그룹 내 정렬: 주요 업무(★) 우선, 나머지는 기존 순서 유지 (stable sort).
function keyTasksFirst(list: TaskItem[]): TaskItem[] {
  return [...list].sort((a, b) => Number(b.isKeyTask ?? false) - Number(a.isKeyTask ?? false));
}

export function ListView({
  tasks,
  doneCount,
  done,
  allTasks,
  userById,
  onAddSubtask
}: ListViewProps) {
  // 하위 업무는 자신의 상태와 무관하게 부모 행 아래에 붙는다. 그룹 분류는
  // 상위 업무만 대상으로 하되, 필터에 걸린 하위 업무의 부모는 부모가
  // 필터에서 빠졌더라도 그룹에 승격시켜 하위 업무가 사라지지 않게 한다.
  const byId = new Map(allTasks.map((t) => [t.id, t] as const));
  const childrenByParent = new Map<string, TaskItem[]>();
  for (const t of allTasks) {
    if (!t.parentTaskId) continue;
    const list = childrenByParent.get(t.parentTaskId);
    if (list) list.push(t);
    else childrenByParent.set(t.parentTaskId, [t]);
  }

  const visibleParents: TaskItem[] = [];
  const seen = new Set<string>();
  const pushParent = (t: TaskItem) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    visibleParents.push(t);
  };
  for (const t of tasks) {
    if (!t.parentTaskId) {
      pushParent(t);
      continue;
    }
    const parent = byId.get(t.parentTaskId);
    if (parent) pushParent(parent);
  }

  // 지연은 상태와 무관한 교차 그룹이라 먼저 분리하고, 상태 그룹들은
  // 지연을 제외해 한 업무가 두 그룹에 중복 노출되지 않게 한다.
  const delayed = visibleParents.filter((t) => t.dueState === "late" && t.status !== "done");
  const notLate = (t: TaskItem) => t.dueState !== "late";
  const inProgress = visibleParents.filter((t) => t.status === "in_progress" && notLate(t));
  const review = visibleParents.filter((t) => t.status === "review" && notLate(t));
  const onHold = visibleParents.filter((t) => t.status === "on_hold" && notLate(t));
  const todo = visibleParents.filter((t) => t.status === "todo" && notLate(t));
  const doneParents = done.filter((t) => !t.parentTaskId);

  const groupProps = { userById, childrenByParent, onAddSubtask };

  return (
    <div className={styles.tblWrap}>
      <TaskGroup
        label="지연 업무"
        count={delayed.length}
        accent="danger"
        tasks={keyTasksFirst(delayed)}
        emptyText="지연된 업무가 없습니다."
        showThead
        {...groupProps}
      />
      <TaskGroup
        label="진행중"
        count={inProgress.length}
        tasks={keyTasksFirst(inProgress)}
        emptyText="진행 중인 업무가 없습니다."
        {...groupProps}
      />
      <TaskGroup
        label="검토중"
        count={review.length}
        tasks={keyTasksFirst(review)}
        emptyText="검토 중인 업무가 없습니다."
        {...groupProps}
      />
      <TaskGroup
        label="보류"
        count={onHold.length}
        tasks={keyTasksFirst(onHold)}
        emptyText="보류된 업무가 없습니다."
        {...groupProps}
      />
      <TaskGroup
        label="대기"
        count={todo.length}
        tasks={keyTasksFirst(todo)}
        emptyText="대기 중인 업무가 없습니다."
        {...groupProps}
      />
      <TaskGroup
        label="완료"
        count={doneCount}
        accent="success"
        tasks={keyTasksFirst(doneParents)}
        emptyText="완료된 업무가 없습니다."
        defaultOpen={false}
        {...groupProps}
      />
    </div>
  );
}

// 접기/펼치기 가능한 업무 그룹. 헤더 전체가 토글(화살표 회전)이고,
// 그룹당 5건 단위로 자체 페이지네이션한다. 업무 추가는 상단 헤더의
// [업무 추가] 버튼 하나로 일원화 — 그룹별 [+ 추가] 는 제거했다.
function TaskGroup({
  label,
  count,
  accent,
  tasks,
  emptyText,
  userById,
  childrenByParent,
  onAddSubtask,
  showThead,
  defaultOpen = true
}: {
  label: string;
  count: number;
  accent?: "danger" | "success";
  tasks: TaskItem[];
  emptyText: string;
  userById: Map<string, User>;
  childrenByParent: Map<string, TaskItem[]>;
  onAddSubtask?: (task: TaskItem) => void;
  showThead?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(1);
  const toggle = () => setOpen((v) => !v);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  // 필터로 목록이 줄어 현재 페이지가 범위를 벗어나면 마지막 페이지로.
  const pageCount = Math.max(1, Math.ceil(tasks.length / GROUP_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged =
    tasks.length > GROUP_PAGE_SIZE
      ? tasks.slice((safePage - 1) * GROUP_PAGE_SIZE, safePage * GROUP_PAGE_SIZE)
      : tasks;

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
      </div>
      {open ? (
        <>
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
              {paged.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: "center", color: "var(--text-4)", padding: 16 }}
                  >
                    {emptyText}
                  </td>
                </tr>
              ) : (
                paged.map((t) => (
                  <TaskRowWithChildren
                    key={t.id}
                    task={t}
                    subtasks={childrenByParent.get(t.id) ?? []}
                    userById={userById}
                    onAddSubtask={onAddSubtask}
                  />
                ))
              )}
            </tbody>
          </table>
          <TasksPagination
            page={safePage}
            pageCount={pageCount}
            onPageChange={setPage}
            className={styles.paginationGroup}
          />
        </>
      ) : null}
    </>
  );
}

function TaskRowWithChildren({
  task,
  subtasks,
  userById,
  onAddSubtask
}: {
  task: TaskItem;
  subtasks: TaskItem[];
  userById: Map<string, User>;
  onAddSubtask?: (task: TaskItem) => void;
}) {
  return (
    <>
      <TaskRow
        task={task}
        assignees={resolveAssignees(task, userById)}
        onAddSubtask={onAddSubtask}
      />
      {subtasks.map((c) => (
        <TaskRow key={c.id} task={c} assignees={resolveAssignees(c, userById)} />
      ))}
    </>
  );
}
