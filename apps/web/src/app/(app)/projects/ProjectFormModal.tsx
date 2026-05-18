"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateProjectInput,
  Project,
  ProjectStatus,
  SalesStatus,
  UpdateProjectInput
} from "@hanmir/shared";
import { projectStatusLabel, salesStatusLabel } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { projectService } from "@/services/project.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";

const STATUS_OPTIONS: ProjectStatus[] = [
  "ready",
  "in_progress",
  "review",
  "on_hold",
  "done",
  "cancelled"
];

const SALES_OPTIONS: SalesStatus[] = [
  "unavailable",
  "preparing",
  "internal",
  "conditional",
  "available"
];

interface FormState {
  name: string;
  fullName: string;
  code: string;
  status: ProjectStatus;
  stageLabel: string;
  department: string;
  ownerName: string;
  startDate: string;
  dueDate: string;
  progress: string;
  description: string;
  goalsText: string;
  outputsText: string;
  budget: string;
  type: string;
  externalPartners: string;
  salesStatus: SalesStatus | "";
}

const EMPTY_FORM: FormState = {
  name: "",
  fullName: "",
  code: "",
  status: "ready",
  stageLabel: "",
  department: "",
  ownerName: "",
  startDate: "",
  dueDate: "",
  progress: "0",
  description: "",
  goalsText: "",
  outputsText: "",
  budget: "",
  type: "",
  externalPartners: "",
  salesStatus: ""
};

function projectToForm(p: Project): FormState {
  return {
    name: p.name,
    fullName: p.fullName ?? "",
    code: p.code ?? "",
    status: p.status,
    stageLabel: p.stageLabel ?? "",
    department: p.department ?? "",
    ownerName: p.ownerName ?? "",
    startDate: p.startDate ?? "",
    dueDate: p.dueDate ?? "",
    progress: String(p.progress ?? 0),
    description: p.description ?? "",
    goalsText: (p.goals ?? []).join("\n"),
    outputsText: (p.outputs ?? []).join("\n"),
    budget: p.budget ?? "",
    type: p.type ?? "",
    externalPartners: p.externalPartners ?? "",
    salesStatus: p.salesStatus ?? ""
  };
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
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

export type ProjectFormMode =
  | { kind: "create" }
  | { kind: "edit"; project: Project };

interface ProjectFormModalProps {
  open: boolean;
  mode: ProjectFormMode;
  onClose: () => void;
  onSubmitted?: (project: Project) => void;
}

export function ProjectFormModal({
  open,
  mode,
  onClose,
  onSubmitted
}: ProjectFormModalProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(mode.kind === "edit" ? projectToForm(mode.project) : EMPTY_FORM);
    setError(null);
  }, [open, mode]);

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const name = form.name.trim();
    if (!name) {
      setError("프로젝트명은 필수 항목입니다.");
      return;
    }
    const progressNum = Number(form.progress);
    if (mode.kind === "edit" && (!Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100)) {
      setError("진행률은 0–100 사이의 숫자여야 합니다.");
      return;
    }

    const common = {
      name,
      ...(form.fullName.trim() ? { fullName: form.fullName.trim() } : {}),
      ...(form.code.trim() ? { code: form.code.trim() } : {}),
      ...(form.stageLabel.trim() ? { stageLabel: form.stageLabel.trim() } : {}),
      ...(form.department.trim() ? { department: form.department.trim() } : {}),
      ...(form.ownerName.trim() ? { ownerName: form.ownerName.trim() } : {}),
      ...(form.startDate ? { startDate: form.startDate } : {}),
      ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(lines(form.goalsText).length > 0 ? { goals: lines(form.goalsText) } : {}),
      ...(lines(form.outputsText).length > 0 ? { outputs: lines(form.outputsText) } : {}),
      ...(form.budget.trim() ? { budget: form.budget.trim() } : {}),
      ...(form.type.trim() ? { type: form.type.trim() } : {}),
      ...(form.externalPartners.trim()
        ? { externalPartners: form.externalPartners.trim() }
        : {}),
      ...(form.salesStatus ? { salesStatus: form.salesStatus } : {}),
      status: form.status
    };

    setSubmitting(true);
    try {
      if (mode.kind === "create") {
        const created = await projectService.createProject(common as CreateProjectInput);
        onSubmitted?.(created);
      } else {
        const payload: UpdateProjectInput = {
          ...common,
          progress: Math.round(progressNum)
        };
        const updated = await projectService.updateProject(mode.project.id, payload);
        onSubmitted?.(updated);
      }
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

  const isEdit = mode.kind === "edit";

  return (
    <Modal
      open={open}
      onClose={close}
      title={isEdit ? "프로젝트 수정" : "프로젝트 추가"}
      description={
        isEdit
          ? `${mode.project.code} ${mode.project.name}`
          : "이름만 필수이며, 나머지는 비워 둘 수 있습니다."
      }
      width={680}
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
            form="project-form"
            className="btn btn--primary btn--sm"
            disabled={submitting}
          >
            {submitting ? "저장 중..." : isEdit ? "저장" : "추가"}
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={onSubmit} noValidate>
        <div className={fstyles.formGrid}>
          <label className={fstyles.span2}>
            프로젝트명
            <input
              className="field"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={120}
              required
              autoFocus
            />
          </label>
          <label>
            정식 명칭
            <input
              className="field"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              maxLength={200}
            />
          </label>
          <label>
            프로젝트 코드
            <input
              className="field"
              placeholder="예: P-2410 (비워두면 자동 생성)"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              maxLength={32}
            />
          </label>
          <label>
            상태
            <select
              className="field"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))
              }
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {projectStatusLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            단계 라벨
            <input
              className="field"
              placeholder="예: 시제품 검증"
              value={form.stageLabel}
              onChange={(e) => setForm((f) => ({ ...f, stageLabel: e.target.value }))}
              maxLength={40}
            />
          </label>
          <label>
            주관 부서
            <input
              className="field"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              maxLength={80}
            />
          </label>
          <label>
            책임자명
            <input
              className="field"
              value={form.ownerName}
              onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
              maxLength={40}
            />
          </label>
          <label>
            시작일
            <input
              className="field"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
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
          {isEdit ? (
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
          ) : null}
          <label>
            유형
            <input
              className="field"
              placeholder="예: 신제품 개발"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              maxLength={40}
            />
          </label>
          <label>
            예산
            <input
              className="field"
              placeholder="예: 1.2억"
              value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
              maxLength={40}
            />
          </label>
          <label>
            외부 협력사
            <input
              className="field"
              value={form.externalPartners}
              onChange={(e) =>
                setForm((f) => ({ ...f, externalPartners: e.target.value }))
              }
              maxLength={120}
            />
          </label>
          <label>
            영업 상태
            <select
              className="field"
              value={form.salesStatus}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  salesStatus: (e.target.value || "") as SalesStatus | ""
                }))
              }
            >
              <option value="">미지정</option>
              {SALES_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {salesStatusLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <label className={fstyles.span2}>
            설명
            <textarea
              className="field"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={1000}
            />
          </label>
          <label className={fstyles.span2}>
            주요 목표 (한 줄에 하나)
            <textarea
              className="field"
              rows={3}
              placeholder={"원자재 비용 12% 절감\n불량률 0.5% 이하 유지"}
              value={form.goalsText}
              onChange={(e) => setForm((f) => ({ ...f, goalsText: e.target.value }))}
            />
          </label>
          <label className={fstyles.span2}>
            주요 산출물 (한 줄에 하나)
            <textarea
              className="field"
              rows={3}
              placeholder={"시험성적서 v1.0\n양산 BOM 확정안"}
              value={form.outputsText}
              onChange={(e) => setForm((f) => ({ ...f, outputsText: e.target.value }))}
            />
          </label>
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
