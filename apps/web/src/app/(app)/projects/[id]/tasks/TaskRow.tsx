"use client";

import { useState, useTransition, type ChangeEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { TaskItem, TaskStatus, User } from "@hanmir/shared";
import { taskPriorityLabel, taskStatusLabel } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { taskService } from "@/services/task.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import styles from "./tasks.module.css";

const STATUS_OPTIONS: TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
  "on_hold"
];

const PRIO_TONE: Record<string, "red" | "amber" | "default"> = {
  top: "red",
  high: "amber",
  normal: "default",
  low: "default"
};

type BusyAction = "status" | "progress" | "delete";

interface TaskRowProps {
  task: TaskItem;
  assignees: User[];
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 404) return "이미 삭제된 업무입니다.";
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
    if (err.status === 400) return `입력값이 올바르지 않습니다 (${err.message}).`;
  }
  return "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function TaskRow({ task, assignees }: TaskRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [progressDraft, setProgressDraft] = useState<string>(String(task.progress));
  const [pending, startTransition] = useTransition();

  const rowBusy = busy !== null || pending;

  const run = async (action: BusyAction, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(action);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  const onStatusChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as TaskStatus;
    if (next === task.status) return;
    void run("status", () => taskService.updateTask(task.id, { status: next }));
  };

  const commitProgress = () => {
    const n = Number(progressDraft);
    if (!Number.isFinite(n)) {
      setProgressDraft(String(task.progress));
      return;
    }
    const clamped = Math.max(0, Math.min(100, Math.round(n)));
    setProgressDraft(String(clamped));
    if (clamped === task.progress) return;
    void run("progress", () => taskService.updateTask(task.id, { progress: clamped }));
  };

  const onProgressKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setProgressDraft(String(task.progress));
      e.currentTarget.blur();
    }
  };

  const onDelete = () => {
    if (!window.confirm(`'${task.title}' 업무를 삭제하시겠습니까?`)) return;
    void run("delete", () => taskService.deleteTask(task.id));
  };

  return (
    <tr className={cn(rowBusy && styles.rowBusy)}>
      <td>
        <span
          className={cn(
            styles.check,
            task.status === "in_progress" && styles.checkProgress,
            task.status === "done" && styles.checkDone
          )}
        />
      </td>
      <td>
        <div className={styles.title}>
          {task.title}
          <span className={styles.id}>{task.code}</span>
          {task.subtaskCount ? (
            <span className={styles.subs}>↳ 하위 {task.subtaskCount}</span>
          ) : null}
        </div>
      </td>
      <td>
        <select
          className={styles.statusSelect}
          value={task.status}
          onChange={onStatusChange}
          disabled={rowBusy}
          aria-label="상태 변경"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {taskStatusLabel[s]}
            </option>
          ))}
        </select>
      </td>
      <td>
        {assignees.length > 0 ? (
          <div className={styles.assignees}>
            {assignees.map((u) => (
              <Avatar
                key={u.id}
                initials={u.initials}
                tone={u.avatarTone ?? "default"}
                className={styles.assigneeAvatar}
              />
            ))}
          </div>
        ) : (
          <div className={styles.assignees}>
            <Avatar initials="미지정" tone="gray" className={styles.assigneeAvatar} />
          </div>
        )}
      </td>
      <td>
        <span
          className={cn(
            styles.due,
            task.dueState === "late" && styles.dueLate,
            task.dueState === "today" && styles.dueToday
          )}
        >
          {task.dueLabel}
        </span>
      </td>
      <td>
        <div className={styles.progressCell}>
          <ProgressBar
            value={task.progress}
            tone={task.dueState === "late" ? "orange" : "blue"}
            className={styles.progressBar}
          />
          <input
            type="number"
            min={0}
            max={100}
            className={styles.progressInput}
            value={progressDraft}
            onChange={(e) => setProgressDraft(e.target.value)}
            onBlur={commitProgress}
            onKeyDown={onProgressKeyDown}
            disabled={rowBusy}
            aria-label="진행률 변경"
          />
          <span className={styles.progressPct}>%</span>
        </div>
      </td>
      <td>
        <div className={styles.priorityCell}>
          <Tag tone={PRIO_TONE[task.priority]}>{taskPriorityLabel[task.priority]}</Tag>
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={onDelete}
            disabled={rowBusy}
            aria-label="업무 삭제"
            title="삭제"
          >
            {busy === "delete" ? "..." : "삭제"}
          </button>
        </div>
      </td>
    </tr>
  );
}
