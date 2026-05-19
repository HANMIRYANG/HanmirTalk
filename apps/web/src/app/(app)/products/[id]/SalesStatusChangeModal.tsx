"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Product, SalesStatus } from "@hanmir/shared";
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

interface Props {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
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

export function SalesStatusChangeModal({ product, onClose, onSaved }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<SalesStatus>(product.salesStatus);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (status === product.salesStatus && !reason.trim()) {
      setError("상태가 변경되지 않았습니다. 다른 상태를 선택하거나 사유를 입력하세요.");
      return;
    }

    setSubmitting(true);
    try {
      await productService.updateProduct(product.id, {
        salesStatus: status,
        ...(reason.trim() ? { salesReason: reason.trim() } : {})
      });
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

  return (
    <Modal
      open
      onClose={close}
      title="영업 상태 변경"
      description={`현재 상태: ${salesStatusLabel[product.salesStatus]}`}
      width={520}
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
            form="sales-status-form"
            className="btn btn--primary btn--sm"
            disabled={submitting}
          >
            {submitting ? "저장 중..." : "변경"}
          </button>
        </>
      }
    >
      <form id="sales-status-form" onSubmit={onSubmit} noValidate>
        <div className={fstyles.formGrid}>
          <label className={fstyles.span2}>
            새 영업 상태
            <select
              className="field"
              value={status}
              onChange={(e) => setStatus(e.target.value as SalesStatus)}
              autoFocus
            >
              {SALES_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {salesStatusLabel[s]}
                </option>
              ))}
            </select>
          </label>
          <label className={fstyles.span2}>
            변경 사유
            <textarea
              className="field"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 시험성적서 v0.3 결재 보류 / 품질팀 재검토 진행 중"
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
