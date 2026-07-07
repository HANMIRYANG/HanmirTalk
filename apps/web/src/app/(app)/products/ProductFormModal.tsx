"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateProductInput,
  Product,
  SalesStatus,
  UpdateProductInput,
  User
} from "@hanmir/shared";
import { salesStatusLabel } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { productService } from "@/services/product.service";
import { fileService } from "@/services/file.service";
import { aiService } from "@/services/ai.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";

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
  category: string;
  subCategory: string;
  ownerId: string;
  description: string;
  featuresText: string;
  applicationsText: string;
  cautionsText: string;
  salesStatus: SalesStatus;
  salesNote: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  code: "",
  category: "",
  subCategory: "",
  ownerId: "",
  description: "",
  featuresText: "",
  applicationsText: "",
  cautionsText: "",
  salesStatus: "preparing",
  salesNote: ""
};

function productToForm(p: Product): FormState {
  return {
    name: p.name,
    code: p.code ?? "",
    category: p.category ?? "",
    subCategory: p.subCategory ?? "",
    ownerId: p.ownerId ?? "",
    description: p.description ?? "",
    featuresText: (p.features ?? []).join("\n"),
    applicationsText: (p.applications ?? []).join("\n"),
    cautionsText: (p.cautions ?? []).join("\n"),
    salesStatus: p.salesStatus ?? "preparing",
    salesNote: p.salesNote ?? ""
  };
}

function lines(s: string): string[] {
  return s.split("\n").map((x) => x.trim()).filter(Boolean);
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 404) return "제품을 찾을 수 없습니다.";
    if (err.status === 400) return `입력값이 올바르지 않습니다 (${err.message}).`;
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export type ProductFormMode =
  | { kind: "create" }
  | { kind: "edit"; product: Product };

interface ProductFormModalProps {
  open: boolean;
  mode: ProductFormMode;
  users: User[];
  onClose: () => void;
  onSubmitted?: (p: Product) => void;
}

interface SpecRow {
  key: string;
  value: string;
}

export function ProductFormModal({
  open,
  mode,
  users,
  onClose,
  onSubmitted
}: ProductFormModalProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AI 초안 (등록 모드 전용) — MSDS/성적서 PDF 를 올려 폼을 채운다.
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  // 규격/사양 초안 — AI 가 채우고 사용자가 수정, 등록 성공 후 일괄 저장.
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  // 제품 대표 이미지 (로컬 파일) — 등록/수정 공통.
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(mode.kind === "edit" ? productToForm(mode.product) : EMPTY_FORM);
    setError(null);
    setAiFiles([]);
    setAiBusy(false);
    setAiNote(null);
    setSpecs([]);
    setImageFile(null);
  }, [open, mode]);

  const runAiDraft = async () => {
    if (aiBusy) return;
    if (aiFiles.length === 0) {
      setAiNote("MSDS 또는 시험성적서 PDF 를 먼저 선택해 주세요.");
      return;
    }
    setAiBusy(true);
    setAiNote("AI 가 문서를 분석하고 있습니다… (수십 초 걸릴 수 있습니다)");
    try {
      const { draft } = await aiService.draftProduct(aiFiles);
      setForm((f) => ({
        ...f,
        name: draft.name || f.name,
        code: draft.code || f.code,
        category: draft.category || f.category,
        subCategory: draft.subCategory || f.subCategory,
        description: draft.description || f.description,
        featuresText: draft.features.length > 0 ? draft.features.join("\n") : f.featuresText,
        applicationsText:
          draft.applications.length > 0 ? draft.applications.join("\n") : f.applicationsText,
        cautionsText: draft.cautions.length > 0 ? draft.cautions.join("\n") : f.cautionsText
      }));
      if (draft.specs.length > 0) setSpecs(draft.specs);
      setAiNote(
        `초안이 채워졌습니다 (사양 ${draft.specs.length}건 포함). 내용을 확인·수정한 뒤 등록해 주세요.`
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
      } else if (err instanceof ApiError && err.status === 415) {
        setAiNote("PDF 파일만 업로드할 수 있습니다.");
      } else if (err instanceof ApiError && err.status === 413) {
        setAiNote("파일이 너무 큽니다 (파일당 10MB 이하).");
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
      setError("제품명은 필수 항목입니다.");
      return;
    }

    const common = {
      name,
      code: form.code.trim(),
      subCategory: form.subCategory.trim(),
      ...(form.ownerId ? { ownerId: form.ownerId } : {}),
      ...(form.category.trim() ? { category: form.category.trim() } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(lines(form.featuresText).length > 0 ? { features: lines(form.featuresText) } : {}),
      ...(lines(form.applicationsText).length > 0
        ? { applications: lines(form.applicationsText) }
        : {}),
      ...(lines(form.cautionsText).length > 0 ? { cautions: lines(form.cautionsText) } : {}),
      ...(form.salesNote.trim() ? { salesNote: form.salesNote.trim() } : {}),
      salesStatus: form.salesStatus
    };

    setSubmitting(true);
    try {
      const result =
        mode.kind === "create"
          ? await productService.createProduct(common as CreateProductInput)
          : await productService.updateProduct(mode.product.id, common as UpdateProductInput);
      // 부가 저장(사양·이미지)은 제품 저장 성공 후 별도 시도 — 실패해도
      // 제품 자체는 저장된 상태이므로 안내만 하고 닫는다 (상세 페이지의
      // 사양 수정/문서 업로드로 재시도 가능).
      try {
        const validSpecs = specs.filter((s) => s.key.trim() && s.value.trim());
        for (let i = 0; i < validSpecs.length; i++) {
          await productService.createSpec(result.id, {
            key: validSpecs[i].key.trim(),
            value: validSpecs[i].value.trim(),
            sortOrder: i
          });
        }
        if (imageFile) {
          const uploaded = await fileService.uploadFile(imageFile, { productId: result.id });
          await productService.createDocument(result.id, {
            attachmentId: uploaded.id,
            documentType: "image"
          });
        }
      } catch {
        window.alert(
          "제품은 저장되었지만 사양/이미지 일부 저장에 실패했습니다. 상세 페이지에서 다시 시도해 주세요."
        );
      }
      onSubmitted?.(result);
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
      title={isEdit ? "제품 수정" : "제품 등록"}
      description={isEdit ? mode.product.name : "이름만 필수이며, 나머지는 비워둘 수 있습니다."}
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
            form="product-form"
            className="btn btn--primary btn--sm"
            disabled={submitting}
          >
            {submitting ? "저장 중..." : isEdit ? "저장" : "등록"}
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} noValidate>
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
              MSDS·시험성적서 PDF(최대 3개, 각 10MB)를 올리면 AI가 아래 폼과
              규격/사양을 채웁니다. 생성 후 내용을 수정할 수 있습니다.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="file"
                accept=".pdf,application/pdf"
                multiple
                disabled={aiBusy}
                onChange={(e) => setAiFiles(Array.from(e.target.files ?? []).slice(0, 3))}
              />
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => void runAiDraft()}
                disabled={aiBusy || aiFiles.length === 0}
              >
                {aiBusy ? "분석 중…" : "AI 초안 생성"}
              </button>
            </div>
            {aiNote ? (
              <div className="muted t-sm" role="status" style={{ marginTop: 8 }}>
                {aiNote}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={fstyles.formGrid}>
          <label className={fstyles.span2}>
            제품명
            <input
              className="field"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={200}
              required
              autoFocus
            />
          </label>
          <label>
            제품 코드
            <input
              className="field"
              placeholder="예: HM-SUS304-CR"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              maxLength={80}
            />
          </label>
          <label>
            담당자
            <select
              className="field"
              value={form.ownerId}
              onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}
            >
              <option value="">(미지정)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.position}
                </option>
              ))}
            </select>
          </label>
          <label>
            카테고리
            <input
              className="field"
              placeholder="예: 스테인리스 강판"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              maxLength={80}
            />
          </label>
          <label>
            소분류
            <input
              className="field"
              placeholder="예: 냉간압연 / 2B 마감"
              value={form.subCategory}
              onChange={(e) => setForm((f) => ({ ...f, subCategory: e.target.value }))}
              maxLength={120}
            />
          </label>
          <label className={fstyles.span2}>
            영업 상태
            <select
              className="field"
              value={form.salesStatus}
              onChange={(e) =>
                setForm((f) => ({ ...f, salesStatus: e.target.value as SalesStatus }))
              }
            >
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
            주요 특징 (한 줄에 하나)
            <textarea
              className="field"
              rows={3}
              placeholder={"고강도\n내식성 우수"}
              value={form.featuresText}
              onChange={(e) => setForm((f) => ({ ...f, featuresText: e.target.value }))}
            />
          </label>
          <label className={fstyles.span2}>
            적용 분야 (한 줄에 하나)
            <textarea
              className="field"
              rows={3}
              placeholder={"자동차 부품\n건축 외장재"}
              value={form.applicationsText}
              onChange={(e) => setForm((f) => ({ ...f, applicationsText: e.target.value }))}
            />
          </label>
          <label className={fstyles.span2}>
            취급 주의 (한 줄에 하나)
            <textarea
              className="field"
              rows={2}
              value={form.cautionsText}
              onChange={(e) => setForm((f) => ({ ...f, cautionsText: e.target.value }))}
            />
          </label>
          <label className={fstyles.span2}>
            영업 메모
            <textarea
              className="field"
              rows={2}
              placeholder="제한 사유, 단가 가이드, 협의 포인트 등"
              value={form.salesNote}
              onChange={(e) => setForm((f) => ({ ...f, salesNote: e.target.value }))}
            />
          </label>
          <label className={fstyles.span2}>
            제품 이미지 (선택 — 로컬 파일)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            {isEdit ? (
              <span className="muted t-sm">새 이미지를 선택하면 대표 이미지가 교체됩니다.</span>
            ) : null}
          </label>
        </div>
        {!isEdit ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>규격 / 사양 (선택)</b>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => setSpecs((s) => [...s, { key: "", value: "" }])}
              >
                + 항목 추가
              </button>
            </div>
            {specs.length === 0 ? (
              <p className="muted t-sm" style={{ margin: 0 }}>
                AI 초안 생성 시 자동으로 채워지며, 직접 추가할 수도 있습니다.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {specs.map((row, i) => (
                  <div key={i} style={{ display: "flex", gap: 6 }}>
                    <input
                      className="field"
                      style={{ flex: "0 0 36%" }}
                      placeholder="항목 (예: 비중)"
                      value={row.key}
                      onChange={(e) =>
                        setSpecs((s) => s.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))
                      }
                    />
                    <input
                      className="field"
                      style={{ flex: 1 }}
                      placeholder="값 (예: 0.85)"
                      value={row.value}
                      onChange={(e) =>
                        setSpecs((s) =>
                          s.map((r, j) => (j === i ? { ...r, value: e.target.value } : r))
                        )
                      }
                    />
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={() => setSpecs((s) => s.filter((_, j) => j !== i))}
                      aria-label="사양 삭제"
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
