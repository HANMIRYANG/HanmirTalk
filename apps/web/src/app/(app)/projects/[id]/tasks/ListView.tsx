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
const GROUP_PAGE_SIZE = 5;

interface ListViewProps {
  tasks: TaskItem[];
  doneCount: number;
  done: TaskItem[];
  userById: Map<string, User>;
}

export function ListView({ tasks, doneCount, done, userById }: ListViewProps) {
  // 지연은 상태와 무관한 교차 그룹이라 먼저 분리하고, 상태 그룹들은
  // 지연을 제외해 한 업무가 두 그룹에 중복 노출되지 않게 한다.
  // 검토중/보류 그룹이 없던 이전 구현은 해당 상태로 바꾼 업무가 목록
  // 뷰에서 아예 사라지는 문제가 있었다 (상태 필터로도 안 보임).
  const delayed = tasks.filter((t) => t.dueState === "late" && t.status !== "done");
  const notLate = (t: TaskItem) => t.dueState !== "late";
  const inProgress = tasks.filter((t) => t.status === "in_progress" && notLate(t));
  const review = tasks.filter((t) => t.status === "review" && notLate(t));
  const onHold = tasks.filter((t) => t.status === "on_hold" && notLate(t));
  const todo = tasks.filter((t) => t.status === "todo" && notLate(t));

  return (
    <div className={styles.tblWrap}>
      <TaskGroup
        label="지연 업무"
        count={delayed.length}
        accent="danger"
        tasks={delayed}
        emptyText="지연된 업무가 없습니다."
        userById={userById}
        showThead
      />
      <TaskGroup
        label="진행중"
        count={inProgress.length}
        tasks={inProgress}
        emptyText="진행 중인 업무가 없습니다."
        userById={userById}
      />
      <TaskGroup
        label="검토중"
        count={review.length}
        tasks={review}
        emptyText="검토 중인 업무가 없습니다."
        userById={userById}
      />
      <TaskGroup
        label="보류"
        count={onHold.length}
        tasks={onHold}
        emptyText="보류된 업무가 없습니다."
        userById={userById}
      />
      <TaskGroup
        label="대기"
        count={todo.length}
        tasks={todo}
        emptyText="대기 중인 업무가 없습니다."
        userById={userById}
      />
      <TaskGroup
        label="완료"
        count={doneCount}
        accent="success"
        tasks={done}
        emptyText="완료된 업무가 없습니다."
        userById={userById}
        defaultOpen={false}
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
  showThead,
  defaultOpen = true
}: {
  label: string;
  count: number;
  accent?: "danger" | "success";
  tasks: TaskItem[];
  emptyText: string;
  userById: Map<string, User>;
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
                  <TaskRow key={t.id} task={t} assignees={resolveAssignees(t, userById)} />
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
