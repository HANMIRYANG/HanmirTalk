"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ProductSpec } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";

interface Props {
  productId: string;
  initial: ProductSpec[];
  onClose: () => void;
  onSaved: () => void;
}

interface Row {
  id?: string;
  key: string;
  value: string;
  removed?: boolean;
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

export function ProductSpecsModal({ productId, initial, onClose, onSaved }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((s) => ({ id: s.id, key: s.key, value: s.value }))
      : [{ key: "", value: "" }]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [rows]);

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const setRow = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((rs) => [...rs, { key: "", value: "" }]);

  const markRemoved = (i: number) => {
    setRows((rs) => {
      const target = rs[i];
      if (!target) return rs;
      if (target.id) {
        return rs.map((r, idx) => (idx === i ? { ...r, removed: true } : r));
      }
      return rs.filter((_, idx) => idx !== i);
    });
  };

  const visible = rows.filter((r) => !r.removed);

  const onSubmit = async () => {
    if (submitting) return;
    setError(null);

    const cleaned = rows
      .map((r) => ({ ...r, key: r.key.trim(), value: r.value.trim() }))
      .filter((r) => r.removed || (r.key && r.value));

    if (cleaned.filter((r) => !r.removed).length === 0) {
      setError("최소 1개 이상의 사양을 입력하세요.");
      return;
    }

    // 중복 key 검증 (살아있는 row 중에서).
    const live = cleaned.filter((r) => !r.removed);
    const keys = new Set<string>();
    for (const r of live) {
      if (keys.has(r.key)) {
        setError(`중복된 사양 이름: ${r.key}`);
        return;
      }
      keys.add(r.key);
    }

    setSubmitting(true);
    try {
      // 1) 삭제
      const removed = cleaned.filter((r) => r.removed && r.id);
      for (const r of removed) {
        await productService.deleteSpec(productId, r.id!);
      }
      // 2) 신규/수정
      let order = 0;
      for (const r of live) {
        const sortOrder = order++;
        if (r.id) {
          await productService.updateSpec(productId, r.id, {
            key: r.key,
            value: r.value,
            sortOrder
          });
        } else {
          await productService.createSpec(productId, {
            key: r.key,
            value: r.value,
            sortOrder
          });
        }
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

  return (
    <Modal
      open
      onClose={close}
      title="제품 사양 편집"
      description="key-value 형식으로 입력하세요. (예: 인장강도 / 520 N/mm²)"
      width={640}
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
            type="button"
            className="btn btn--primary btn--sm"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "저장 중..." : "저장"}
          </button>
        </>
      }
    >
      <div className={fstyles.formGrid}>
        {rows.map((r, i) =>
          r.removed ? null : (
            <div key={i} className={fstyles.span2} style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr auto", gap: 8 }}>
              <input
                className="field"
                placeholder="사양 이름"
                value={r.key}
                onChange={(e) => setRow(i, { key: e.target.value })}
                maxLength={60}
              />
              <input
                className="field"
                placeholder="값"
                value={r.value}
                onChange={(e) => setRow(i, { value: e.target.value })}
                maxLength={200}
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => markRemoved(i)}
                disabled={visible.length <= 1}
              >
                삭제
              </button>
            </div>
          )
        )}
        <div className={fstyles.span2}>
          <button type="button" className="btn btn--outline btn--sm" onClick={addRow}>
            + 사양 추가
          </button>
        </div>
      </div>
      {error ? (
        <div className={fstyles.formError} role="alert">
          {error}
        </div>
      ) : null}
    </Modal>
  );
}
