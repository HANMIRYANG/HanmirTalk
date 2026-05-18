"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product, SalesStatus } from "@hanmir/shared";
import { salesStatusLabel } from "@hanmir/shared";
import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { ProductFormModal } from "@/app/(app)/products/ProductFormModal";

const SALES_OPTIONS: SalesStatus[] = [
  "unavailable",
  "preparing",
  "internal",
  "conditional",
  "available"
];

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 404) return "제품을 찾을 수 없습니다.";
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "처리에 실패했습니다.";
}

interface ProductActionsProps {
  product: Product;
}

export function ProductActions({ product }: ProductActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<SalesStatus>(product.salesStatus);

  const onStatusChange = async (next: SalesStatus) => {
    if (busy || next === currentStatus) return;
    setBusy(true);
    try {
      const updated = await productService.updateProduct(product.id, { salesStatus: next });
      setCurrentStatus(updated.salesStatus);
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

  const onDelete = async () => {
    if (busy) return;
    if (
      !window.confirm(
        `'${product.name}' 제품을 삭제하시겠습니까?\n복구할 수 없습니다.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await productService.deleteProduct(product.id);
      router.push("/products");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert(describeError(err));
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <select
        className="field"
        value={currentStatus}
        onChange={(e) => onStatusChange(e.target.value as SalesStatus)}
        disabled={busy}
        aria-label="영업 상태 변경"
        style={{ width: 160, padding: "6px 10px", fontSize: 12.5 }}
      >
        {SALES_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {salesStatusLabel[s]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn--outline btn--sm"
        onClick={() => setEditOpen(true)}
        disabled={busy}
      >
        수정
      </button>
      <button
        type="button"
        className="btn btn--outline btn--sm"
        onClick={onDelete}
        disabled={busy}
      >
        {busy ? "처리 중..." : "삭제"}
      </button>
      <ProductFormModal
        open={editOpen}
        mode={{ kind: "edit", product }}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
