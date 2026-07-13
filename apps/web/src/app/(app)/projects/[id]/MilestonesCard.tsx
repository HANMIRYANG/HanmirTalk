"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Milestone } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { projectService } from "@/services/project.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";
import styles from "./detail.module.css";

const milestoneTone: Record<string, "default" | "amber" | "green" | "red"> = {
  done: "green",
  in_progress: "amber",
  delayed: "amber",
  pending: "default"
};

const milestoneLabel: Record<string, string> = {
  done: "완료",
  in_progress: "진행중",
  delayed: "진행중",
  pending: "대기"
};

const STATUS_OPTIONS: { value: Milestone["status"]; label: string }[] = [
  { value: "pending", label: "대기" },
  { value: "in_progress", label: "진행중" },
  { value: "done", label: "완료" },
  { value: "delayed", label: "지연" }
];

interface FormState {
  title: string;
  subtitle: string;
  date: string;
  status: Milestone["status"];
}

const EMPTY_FORM: FormState = { title: "", subtitle: "", date: "", status: "pending" };

// 서버는 "YYYY.MM.DD" / "YYYY-MM-DD" 둘 다 받지만 <input type="date">는
// 대시 형식을 쓴다.
function toInputDate(value: string): string {
  return value.trim().replace(/[./]/g, "-").slice(0, 10);
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

interface Props {
  projectId: string;
  milestones: Milestone[];
  canManage: boolean;
}

const MILESTONE_PAGE_SIZE = 5;

export function MilestonesCard({ projectId, milestones, canManage }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<
    { mode: "create" } | { mode: "edit"; milestone: Milestone } | null
  >(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(milestones.length / MILESTONE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedMilestones = milestones.slice(
    (safePage - 1) * MILESTONE_PAGE_SIZE,
    safePage * MILESTONE_PAGE_SIZE
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setModal({ mode: "create" });
  };

  const openEdit = (m: Milestone) => {
    setForm({
      title: m.title,
      subtitle: m.subtitle,
      date: toInputDate(m.date),
      status: m.status
    });
    setError(null);
    setModal({ mode: "edit", milestone: m });
  };

  const close = () => {
    if (busy) return;
    setModal(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !modal) return;
    setError(null);
    const title = form.title.trim();
    if (!title) {
      setError("마일스톤 제목은 필수입니다.");
      return;
    }
    if (!form.date) {
      setError("날짜는 필수입니다.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title,
        subtitle: form.subtitle.trim(),
        date: form.date,
        status: form.status
      };
      if (modal.mode === "create") {
        await projectService.addMilestone(projectId, payload);
      } else {
        await projectService.updateMilestone(projectId, modal.milestone.id, payload);
      }
      setModal(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (m: Milestone) => {
    if (busy) return;
    if (!window.confirm(`'${m.title}' 마일스톤을 삭제하시겠습니까?`)) return;
    setBusy(true);
    try {
      await projectService.deleteMilestone(projectId, m.id);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn("card", styles.section)}>
      <div className="card__head">
        <h3>주요 마일스톤</h3>
        <span className="muted">
          {milestones.length}개 마일스톤 ·{" "}
          {milestones.filter((m) => m.status === "done").length}개 완료
        </span>
        <div className="right">
          {canManage ? (
            <button type="button" className="btn btn--primary btn--sm" onClick={openCreate}>
              + 마일스톤
            </button>
          ) : null}
          <Link href={`/projects/${projectId}/gantt`} className="btn btn--ghost btn--sm">
            간트 보기 →
          </Link>
        </div>
      </div>
      {milestones.length === 0 ? (
        <div className="muted t-sm" style={{ padding: 16 }}>
          등록된 마일스톤이 없습니다.
          {canManage ? " 위 버튼으로 주요 마일스톤을 추가하세요." : ""}
        </div>
      ) : (
        <div className={styles.milestoneList}>
          {pagedMilestones.map((m) => (
            <div key={m.id} className={styles.milestone}>
              <div
                className={cn(
                  styles.dot,
                  m.status === "done" && styles.dotDone,
                  (m.status === "in_progress" || m.status === "delayed") && styles.dotCurrent,
                  m.status === "pending" && styles.dotFuture
                )}
              />
              <div>
                <div className={styles.mTitle}>{m.title}</div>
                {m.subtitle ? <div className={styles.mSub}>{m.subtitle}</div> : null}
              </div>
              <Tag tone={milestoneTone[m.status]}>{milestoneLabel[m.status]}</Tag>
              <div className={styles.mDate}>{m.date}</div>
              {canManage ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => openEdit(m)}
                    disabled={busy}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onDelete(m)}
                    disabled={busy}
                  >
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      {modal ? (
        <Modal
          open
          onClose={close}
          title={modal.mode === "create" ? "마일스톤 추가" : "마일스톤 수정"}
          width={460}
          footer={
            <>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={close}
                disabled={busy}
              >
                취소
              </button>
              <button
                type="submit"
                form="milestone-form"
                className="btn btn--primary btn--sm"
                disabled={busy}
              >
                {busy ? "저장 중..." : "저장"}
              </button>
            </>
          }
        >
          <form id="milestone-form" onSubmit={onSubmit} noValidate>
            <div className={fstyles.formGrid}>
              <label className={fstyles.span2}>
                제목
                <input
                  className="field"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  maxLength={200}
                  required
                  autoFocus
                />
              </label>
              <label className={fstyles.span2}>
                설명 (선택)
                <input
                  className="field"
                  value={form.subtitle}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                  maxLength={300}
                />
              </label>
              <label>
                날짜
                <input
                  type="date"
                  className="field"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </label>
              <label>
                상태
                <select
                  className="field"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as Milestone["status"] }))
                  }
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error ? (
              <div className={fstyles.formError} role="alert">
                {error}
              </div>
            ) : null}
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
