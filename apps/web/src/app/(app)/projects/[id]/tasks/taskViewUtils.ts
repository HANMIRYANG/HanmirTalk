import type { TaskItem, TaskStatus, User } from "@hanmir/shared";
import { taskPriorityLabel, taskStatusLabel } from "@hanmir/shared";

export const STATUS_TONE: Record<TaskStatus, "blue" | "amber" | "red" | "default" | "green"> = {
  todo: "default",
  in_progress: "blue",
  review: "amber",
  done: "green",
  on_hold: "amber"
};

export const PRIO_TONE: Record<string, "red" | "amber" | "default"> = {
  top: "red",
  high: "amber",
  normal: "default",
  low: "default"
};

export function resolveAssignees(task: TaskItem, userById: Map<string, User>): User[] {
  const out: User[] = [];
  for (const id of task.assigneeIds) {
    const user = userById.get(id);
    if (user) out.push(user);
  }
  return out;
}

export function downloadCsv(tasks: TaskItem[], userById: Map<string, User>) {
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
