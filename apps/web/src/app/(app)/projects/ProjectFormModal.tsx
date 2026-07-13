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
import { taskService } from "@/services/task.service";
import { aiService } from "@/services/ai.service";
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
  code: string;
  status: ProjectStatus;
  stageLabel: string;
  department: string;
  ownerName: string;
  startDate: string;
  dueDate: string;
  progress: string;
  progressMode: "auto" | "manual";
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
  code: "",
  status: "ready",
  stageLabel: "",
  department: "",
  ownerName: "",
  startDate: "",
  dueDate: "",
  progress: "0",
  progressMode: "auto",
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
    code: p.code ?? "",
    status: p.status,
    stageLabel: p.stageLabel ?? "",
    department: p.department ?? "",
    ownerName: p.ownerName ?? "",
    startDate: p.startDate ?? "",
    dueDate: p.dueDate ?? "",
    progress: String(p.progress ?? 0),
    progressMode: p.progressManual ? "manual" : "auto",
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

interface MilestoneRow {
  title: string;
  subtitle: string;
  date: string;
}

interface TaskDraftRow {
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
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
  // AI 초안 (추가 모드 전용) — 자연어 서술로 폼과 마일스톤을 채운다.
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  // 마일스톤 초안 — 생성 성공 후 addMilestone 으로 일괄 저장.
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  // 주요 업무 초안 — 생성 성공 후 isKeyTask=true 업무로 일괄 등록.
  const [draftTasks, setDraftTasks] = useState<TaskDraftRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(mode.kind === "edit" ? projectToForm(mode.project) : EMPTY_FORM);
    setError(null);
    setAiPrompt("");
    setAiBusy(false);
    setAiNote(null);
    setMilestones([]);
    setDraftTasks([]);
  }, [open, mode]);

  const runAiDraft = async () => {
    if (aiBusy) return;
    if (aiPrompt.trim().length < 10) {
      setAiNote("프로젝트 내용을 조금 더 자세히 적어 주세요 (10자 이상).");
      return;
    }
    setAiBusy(true);
    setAiNote("AI 가 초안을 작성하고 있습니다…");
    try {
      const { draft } = await aiService.draftProject(aiPrompt.trim());
      setForm((f) => ({
        ...f,
        name: draft.name || draft.fullName || f.name,
        code: draft.code || f.code,
        department: draft.department || f.department,
        startDate: draft.startDate || f.startDate,
        dueDate: draft.dueDate || f.dueDate,
        description: draft.description || f.description,
        goalsText: draft.goals.length > 0 ? draft.goals.join("\n") : f.goalsText,
        outputsText: draft.outputs.length > 0 ? draft.outputs.join("\n") : f.outputsText,
        type: draft.type || f.type,
        budget: draft.budget || f.budget,
        externalPartners: draft.externalPartners || f.externalPartners
      }));
      if (draft.milestones.length > 0) setMilestones(draft.milestones);
      const aiTasks = draft.tasks ?? [];
      if (aiTasks.length > 0) setDraftTasks(aiTasks);
      setAiNote(
        `초안이 채워졌습니다 (마일스톤 ${draft.milestones.length}건 · 주요 업무 ${aiTasks.length}건 포함). 내용을 확인·수정한 뒤 추가해 주세요.`
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        setAiNote("AI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.");
      } else if (err instanceof ApiError && err.status === 503) {
        setAiNote("AI 기능이 설정되지 않았습니다. 관리자에게 문의해 주세요.");
      } else {
        setAiNote("AI 초안 생성에 실패했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setAiBusy(false);
    }
  };

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
    if (
      mode.kind === "edit" &&
      form.progressMode === "manual" &&
      (!Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100)
    ) {
      setError("진행률은 0–100 사이의 숫자여야 합니다.");
      return;
    }

    // 이름 단일화 (docs/24 후속) — 정식 명칭 입력란을 없애고 fullName 은
    // 항상 name 과 동기화. 기존에 두 이름이 달랐던 프로젝트도 수정 저장
    // 시점에 하나로 수렴한다.
    const common = {
      name,
      fullName: name,
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
        // 마일스톤 초안 저장 — 실패해도 프로젝트는 생성된 상태이므로
        // 안내만 하고 진행 (상세의 '주요 일정' 카드에서 재시도 가능).
        const validMilestones = milestones.filter((m) => m.title.trim() && m.date);
        if (validMilestones.length > 0) {
          try {
            for (const m of validMilestones) {
              await projectService.addMilestone(created.id, {
                title: m.title.trim(),
                ...(m.subtitle.trim() ? { subtitle: m.subtitle.trim() } : {}),
                date: m.date
              });
            }
          } catch {
            window.alert(
              "프로젝트는 생성되었지만 마일스톤 일부 저장에 실패했습니다. 상세 페이지의 '주요 일정'에서 다시 추가해 주세요."
            );
          }
        }
        // 주요 업무 초안 — 마일스톤과 동일 패턴으로 isKeyTask 업무 일괄 등록.
        const validTasks = draftTasks.filter((t) => t.title.trim());
        if (validTasks.length > 0) {
          try {
            for (const t of validTasks) {
              await taskService.createTask(created.id, {
                title: t.title.trim(),
                isKeyTask: true,
                ...(t.description.trim() ? { description: t.description.trim() } : {}),
                ...(t.startDate ? { startDate: t.startDate } : {}),
                ...(t.dueDate ? { dueDate: t.dueDate } : {})
              });
            }
          } catch {
            window.alert(
              "프로젝트는 생성되었지만 주요 업무 일부 등록에 실패했습니다. '업무' 탭에서 다시 추가해 주세요."
            );
          }
        }
        onSubmitted?.(created);
      } else {
        const payload: UpdateProjectInput = {
          ...common,
          progressMode: form.progressMode,
          ...(form.progressMode === "manual" ? { progress: Math.round(progressNum) } : {})
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
        {!isEdit ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 14,
              background: "var(--surface-muted)"
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              🤖 AI로 작성 (선택)
            </div>
            <p className="muted t-sm" style={{ margin: "0 0 8px" }}>
              프로젝트를 자유롭게 서술하면 AI가 아래 폼과 마일스톤·주요 업무
              초안을 채웁니다. 예: &ldquo;9월 말까지 HC-850 양산 준비. 도료사업본부 주관,
              7월 파일럿 생산, 8월 라인 시운전, 예산 1억.&rdquo;
            </p>
            <textarea
              className="field"
              rows={3}
              placeholder="무엇을, 언제까지, 누가(부서), 어떤 단계로 진행하는지 적어 주세요."
              value={aiPrompt}
              disabled={aiBusy}
              onChange={(e) => setAiPrompt(e.target.value)}
              maxLength={4000}
            />
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => void runAiDraft()}
                disabled={aiBusy || aiPrompt.trim().length === 0}
              >
                {aiBusy ? "작성 중…" : "AI 초안 생성"}
              </button>
              {aiNote ? (
                <span className="muted t-sm" role="status">
                  {aiNote}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
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
            단계 라벨 (선택)
            <input
              className="field"
              placeholder="비워두면 상태 표시 · 입력 시 목록·헤더에서 상태 글자를 대체 (예: 시제품 검증)"
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
            <label className={fstyles.span2}>
              진행률
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                <select
                  className="field"
                  style={{ flex: "0 0 190px" }}
                  value={form.progressMode}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      progressMode: e.target.value as "auto" | "manual"
                    }))
                  }
                >
                  <option value="auto">자동 (업무 완료 기준)</option>
                  <option value="manual">직접 지정</option>
                </select>
                {form.progressMode === "manual" ? (
                  <>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Number(form.progress) || 0}
                      onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))}
                      style={{ flex: 1 }}
                      aria-label="진행률"
                    />
                    <b
                      style={{
                        width: 48,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums"
                      }}
                    >
                      {Number(form.progress) || 0}%
                    </b>
                  </>
                ) : (
                  <span className="muted t-sm">
                    {mode.kind === "edit" && mode.project.taskCounts.total > 0
                      ? `완료 ${mode.project.taskCounts.done}/${mode.project.taskCounts.total} 업무 기준 — 현재 ${Math.round(
                          (mode.project.taskCounts.done / mode.project.taskCounts.total) * 100
                        )}%`
                      : "등록된 업무가 없어 0%로 표시됩니다. 업무를 완료할 때마다 자동 갱신."}
                  </span>
                )}
              </div>
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
        {!isEdit ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>마일스톤 (선택)</b>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() =>
                  setMilestones((m) => [...m, { title: "", subtitle: "", date: "" }])
                }
              >
                + 일정 추가
              </button>
            </div>
            {milestones.length === 0 ? (
              <p className="muted t-sm" style={{ margin: 0 }}>
                AI 초안 생성 시 자동으로 채워지며, 생성 후 상세 페이지의 &lsquo;주요
                일정&rsquo; 카드에서도 관리할 수 있습니다.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {milestones.map((row, i) => (
                  <div key={i} style={{ display: "flex", gap: 6 }}>
                    <input
                      className="field"
                      style={{ flex: "0 0 32%" }}
                      placeholder="단계명"
                      value={row.title}
                      onChange={(e) =>
                        setMilestones((m) =>
                          m.map((r, j) => (j === i ? { ...r, title: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="field"
                      style={{ flex: 1 }}
                      placeholder="부연 (선택)"
                      value={row.subtitle}
                      onChange={(e) =>
                        setMilestones((m) =>
                          m.map((r, j) => (j === i ? { ...r, subtitle: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="field"
                      style={{ flex: "0 0 150px" }}
                      type="date"
                      value={row.date}
                      onChange={(e) =>
                        setMilestones((m) =>
                          m.map((r, j) => (j === i ? { ...r, date: e.target.value } : r))
                        )
                      }
                    />
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={() => setMilestones((m) => m.filter((_, j) => j !== i))}
                      aria-label="마일스톤 삭제"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {!isEdit ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>주요 업무 (선택)</b>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() =>
                  setDraftTasks((t) => [
                    ...t,
                    { title: "", description: "", startDate: "", dueDate: "" }
                  ])
                }
              >
                + 업무 추가
              </button>
            </div>
            {draftTasks.length === 0 ? (
              <p className="muted t-sm" style={{ margin: 0 }}>
                AI 초안 생성 시 자동으로 채워지며, 프로젝트 생성과 함께 &lsquo;업무&rsquo;
                탭에 주요 업무(★)로 등록됩니다.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {draftTasks.map((row, i) => (
                  <div key={i} style={{ display: "flex", gap: 6 }}>
                    <input
                      className="field"
                      style={{ flex: 1 }}
                      placeholder="업무명"
                      value={row.title}
                      onChange={(e) =>
                        setDraftTasks((t) =>
                          t.map((r, j) => (j === i ? { ...r, title: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="field"
                      style={{ flex: "0 0 150px" }}
                      type="date"
                      title="시작일"
                      value={row.startDate}
                      onChange={(e) =>
                        setDraftTasks((t) =>
                          t.map((r, j) => (j === i ? { ...r, startDate: e.target.value } : r))
                        )
                      }
                    />
                    <input
                      className="field"
                      style={{ flex: "0 0 150px" }}
                      type="date"
                      title="마감일"
                      value={row.dueDate}
                      onChange={(e) =>
                        setDraftTasks((t) =>
                          t.map((r, j) => (j === i ? { ...r, dueDate: e.target.value } : r))
                        )
                      }
                    />
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={() => setDraftTasks((t) => t.filter((_, j) => j !== i))}
                      aria-label="주요 업무 삭제"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {error ? (
          <div className={fstyles.formError} role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
