"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateProductInput,
  Product,
  SalesStatus,
  UpdateProductInput
} from "@hanmir/shared";
import { salesStatusLabel } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { productService } from "@/services/product.service";
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
  category: string;
  description: string;
  featuresText: string;
  applicationsText: string;
  cautionsText: string;
  salesStatus: SalesStatus;
  salesNote: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  category: "",
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
    category: p.category ?? "",
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
  onClose: () => void;
  onSubmitted?: (p: Product) => void;
}

export function ProductFormModal({
  open,
  mode,
  onClose,
  onSubmitted
}: ProductFormModalProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(mode.kind === "edit" ? productToForm(mode.product) : EMPTY_FORM);
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
      setError("제품명은 필수 항목입니다.");
      return;
    }

    const common = {
      name,
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
