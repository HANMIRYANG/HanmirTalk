"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProductLot } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";

type Verdict = "pass" | "hold" | "retest";

const VERDICTS: { value: "" | Verdict; label: string }[] = [
  { value: "", label: "미판정" },
  { value: "pass", label: "합격" },
  { value: "hold", label: "보류" },
  { value: "retest", label: "재시험" }
];

interface Props {
  productId: string;
  mode: "create" | "edit";
  initial?: ProductLot;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  number: string;
  producedAt: string;
  quantity: string;
  verdict: "" | Verdict;
  testedAt: string;
  note: string;
}

function toForm(lot?: ProductLot): FormState {
  return {
    number: lot?.number ?? "",
    producedAt: lot?.producedAt ?? "",
    quantity: lot?.quantity ?? "",
    verdict: (lot?.verdict as Verdict | undefined) ?? "",
    testedAt: lot?.testedAt ?? "",
    note: lot?.note ?? ""
  };
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 404) return "LOT를 찾을 수 없습니다.";
    if (err.status === 409) return "이미 등록된 LOT 번호입니다.";
    if (err.status === 400) return `입력값이 올바르지 않습니다 (${err.message}).`;
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function ProductLotModal({ productId, mode, initial, onClose, onSaved }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (submitting || deleting) return;
    onClose();
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const number = form.number.trim();
    if (!number) {
      setError("LOT 번호는 필수 항목입니다.");
      return;
    }

    const payload = {
      number,
      ...(form.producedAt ? { producedAt: form.producedAt } : {}),
      ...(form.quantity.trim() ? { quantity: form.quantity.trim() } : {}),
      ...(form.verdict ? { verdict: form.verdict as Verdict } : {}),
      ...(form.testedAt ? { testedAt: form.testedAt } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {})
    };

    setSubmitting(true);
    try {
      if (mode === "edit" && initial) {
        await productService.updateLot(productId, initial.id, payload);
      } else {
        await productService.createLot(productId, payload);
      }
      onSaved();
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

  const onDelete = async () => {
    if (mode !== "edit" || !initial) return;
    if (!window.confirm(`LOT ${initial.number}을(를) 삭제하시겠습니까?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await productService.deleteLot(productId, initial.id);
      onSaved();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError(describeError(err));
    } finally {
      setDeleting(false);
    }
  };

  const isEdit = mode === "edit";

  return (
    <Modal
      open
      onClose={close}
      title={isEdit ? "LOT 수정" : "LOT 등록"}
      description={isEdit ? initial?.number : "LOT 번호는 제품 내에서 유일해야 합니다."}
      width={560}
      footer={
        <>
          {isEdit ? (
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={onDelete}
              disabled={submitting || deleting}
              style={{ marginRight: "auto", color: "#DC2626", borderColor: "#DC2626" }}
            >
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={close}
            disabled={submitting || deleting}
          >
            취소
          </button>
          <button
            type="submit"
            form="lot-form"
            className="btn btn--primary btn--sm"
            disabled={submitting || deleting}
          >
            {submitting ? "저장 중..." : isEdit ? "저장" : "등록"}
          </button>
        </>
      }
    >
      <form id="lot-form" onSubmit={onSubmit} noValidate>
        <div className={fstyles.formGrid}>
          <label>
            LOT 번호
            <input
              className="field"
              value={form.number}
              onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              maxLength={60}
              required
              autoFocus
              placeholder="예: L2026-0042"
            />
          </label>
          <label>
            생산일
            <input
              className="field"
              type="date"
              value={form.producedAt}
              onChange={(e) => setForm((f) => ({ ...f, producedAt: e.target.value }))}
            />
          </label>
          <label>
            수량
            <input
              className="field"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              placeholder="예: 1200 (kg)"
              maxLength={40}
            />
          </label>
          <label>
            판정
            <select
              className="field"
              value={form.verdict}
              onChange={(e) =>
                setForm((f) => ({ ...f, verdict: e.target.value as "" | Verdict }))
              }
            >
              {VERDICTS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            시험일
            <input
              className="field"
              type="date"
              value={form.testedAt}
              onChange={(e) => setForm((f) => ({ ...f, testedAt: e.target.value }))}
            />
          </label>
          <label className={fstyles.span2}>
            비고
            <textarea
              className="field"
              rows={3}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              maxLength={500}
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
