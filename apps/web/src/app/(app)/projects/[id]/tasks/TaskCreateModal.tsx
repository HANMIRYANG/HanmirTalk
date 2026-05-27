"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateTaskInput,
  TaskItem,
  TaskPriority,
  TaskStatus,
  User
} from "@hanmir/shared";
import { taskPriorityLabel, taskStatusLabel } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { taskService } from "@/services/task.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";
import styles from "./TaskCreateModal.module.css";

const STATUS_OPTIONS: TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
  "on_hold"
];

const PRIORITY_OPTIONS: TaskPriority[] = ["top", "high", "normal", "low"];

interface FormState {
  title: string;
  code: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds: string[];
  dueDate: string;
  progress: string;
  description: string;
}

const emptyForm = (
  defaultStatus: TaskStatus,
  initialTitle?: string,
  initialDescription?: string
): FormState => ({
  title: initialTitle ?? "",
  code: "",
  status: defaultStatus,
  priority: "normal",
  assigneeIds: [],
  dueDate: "",
  progress: "0",
  description: initialDescription ?? ""
});

interface TaskCreateModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  users: User[];
  defaultStatus?: TaskStatus;
  // Phase 10 M-3 — 메시지 → 업무 만들기 흐름에서 prefill 값. 모달이 열릴 때
  // 매번 form 을 리셋하므로 같은 값을 다시 넘기면 그대로 채워진다.
  initialTitle?: string;
  initialDescription?: string;
  onCreated?: (task: TaskItem) => void;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 404) return "프로젝트를 찾을 수 없습니다.";
    if (err.status === 400) return `입력값이 올바르지 않습니다 (${err.message}).`;
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function TaskCreateModal({
  open,
  onClose,
  projectId,
  users,
  defaultStatus = "todo",
  initialTitle,
  initialDescription,
  onCreated
}: TaskCreateModalProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(defaultStatus, initialTitle, initialDescription)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(emptyForm(defaultStatus, initialTitle, initialDescription));
      setError(null);
    }
  }, [open, defaultStatus, initialTitle, initialDescription]);

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const toggleAssignee = (userId: string) => {
    setForm((f) => {
      const set = new Set(f.assigneeIds);
      if (set.has(userId)) set.delete(userId);
      else set.add(userId);
      return { ...f, assigneeIds: Array.from(set) };
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const title = form.title.trim();
    if (!title) {
      setError("업무 제목은 필수 항목입니다.");
      return;
    }
    const progressNum = Number(form.progress);
    if (!Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100) {
      setError("진행률은 0–100 사이의 숫자여야 합니다.");
      return;
    }

    const payload: CreateTaskInput = {
      title,
      status: form.status,
      priority: form.priority,
      progress: Math.round(progressNum),
      ...(form.code.trim() ? { code: form.code.trim() } : {}),
      ...(form.assigneeIds.length > 0 ? { assigneeIds: form.assigneeIds } : {}),
      ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {})
    };

    setSubmitting(true);
    try {
      const created = await taskService.createTask(projectId, payload);
      onCreated?.(created);
      onClose();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="업무 추가"
      description="제목 외 항목은 모두 선택사항이며, 추가 후 인라인에서 수정할 수 있습니다."
      width={620}
      footer={
        <>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={close}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="submit"
            form="task-create-form"
            className="btn btn--primary btn--sm"
            disabled={submitting}
          >
            {submitting ? "추가 중..." : "추가"}
          </button>
        </>
      }
    >
      <form id="task-create-form" onSubmit={onSubmit} noValidate>
        <div className={fstyles.formGrid}>
          <label className={fstyles.span2}>
            업무 제목
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={120}
              required
              autoFocus
            />
          </label>
          <label>
            상태
            <select
              className="field"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as TaskStatus }))
              }
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {taskStatusLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            우선순위
            <select
              className="field"
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))
              }
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {taskPriorityLabel[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            업무 코드
            <input
              className="field"
              placeholder="예: T-2410-01"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              maxLength={32}
            />
          </label>
          <label>
            마감일
            <input
              className="field"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </label>
          <label>
            진행률 (%)
            <input
              className="field"
              type="number"
              min={0}
              max={100}
              value={form.progress}
              onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))}
            />
          </label>
          <label className={fstyles.span2}>
            설명
            <textarea
              className="field"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={500}
            />
          </label>
          <div className={fstyles.span2}>
            <div className={styles.assigneeHead}>
              <span>담당자</span>
              <span className={styles.assigneeHint}>
                {form.assigneeIds.length > 0
                  ? `${form.assigneeIds.length}명 선택됨`
                  : "선택하지 않으면 미지정으로 생성됩니다."}
              </span>
            </div>
            <div className={styles.assigneeList}>
              {users.length === 0 ? (
                <div className={styles.assigneeEmpty}>등록된 사용자가 없습니다.</div>
              ) : (
                users.map((u) => {
                  const checked = form.assigneeIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className={styles.assigneeItem}
                      data-checked={checked || undefined}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAssignee(u.id)}
                      />
                      <Avatar
                        initials={u.initials}
                        tone={u.avatarTone ?? "default"}
                        size="sm"
                      />
                      <span className={styles.assigneeName}>
                        {u.name}
                        <span className={styles.assigneeDept}>
                          {u.departmentName} · {u.position}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>
        {error ? (
          <div className={fstyles.formError} role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
