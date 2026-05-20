"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProductDocumentType } from "@hanmir/shared";
import { productDocumentTypeLabel } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { productService } from "@/services/product.service";
import { fileService } from "@/services/file.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";

interface Props {
  productId: string;
  documentType: ProductDocumentType;
  onClose: () => void;
  onSaved: () => void;
}

// docs/12 화이트리스트 일부 — 문서/이미지 위주. 서버가 최종 검증한다.
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.hwp,.hwpx,.xls,.xlsx";

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 404) return "제품 또는 첨부 파일을 찾을 수 없습니다.";
    if (err.status === 413) return "파일이 너무 큽니다 (최대 50MB).";
    if (err.status === 415) return "허용되지 않는 파일 형식입니다.";
    if (err.status === 400) return `입력값이 올바르지 않습니다 (${err.message}).`;
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function ProductDocumentUploadModal({
  productId,
  documentType,
  onClose,
  onSaved
}: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeLabel = productDocumentTypeLabel[documentType];

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFile(event.target.files?.[0] ?? null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!file) {
      setError("업로드할 파일을 선택해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // 2-step: 첨부를 먼저 업로드(productId 스코프)한 뒤 product_documents로 분류.
      const attachment = await fileService.uploadFile(file, { productId });
      await productService.createDocument(productId, {
        attachmentId: attachment.id,
        documentType
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
      title={`${typeLabel} 업로드`}
      description="제품에 연결할 문서 파일을 선택하세요. PDF·이미지·오피스 문서를 지원합니다."
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
            form="product-doc-form"
            className="btn btn--primary btn--sm"
            disabled={submitting || !file}
          >
            {submitting ? "업로드 중..." : "업로드"}
          </button>
        </>
      }
    >
      <form id="product-doc-form" onSubmit={onSubmit} noValidate>
        <div className={fstyles.formGrid}>
          <label className={fstyles.span2}>
            문서 파일
            <input
              className="field"
              type="file"
              accept={ACCEPT}
              onChange={onPick}
              autoFocus
            />
          </label>
        </div>
        {file ? (
          <div className="muted t-xs" style={{ marginTop: 8 }}>
            선택됨: {file.name}
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
