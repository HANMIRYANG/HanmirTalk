"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product, User } from "@hanmir/shared";
import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { confirmDialog, alertDialog } from "@/components/ui/AppDialogHost";
import { ProductFormModal } from "@/app/(app)/products/ProductFormModal";
import { SalesStatusChangeModal } from "./SalesStatusChangeModal";

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
  users: User[];
}

export function ProductActions({ product, users }: ProductActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    if (busy) return;
    if (
      !(await confirmDialog(
        `'${product.name}' 제품을 삭제하시겠습니까?\n복구할 수 없습니다.`,
        { danger: true }
      ))
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
      alertDialog(describeError(err));
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        onClick={() => setStatusOpen(true)}
        disabled={busy}
      >
        상태 변경
      </button>
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
        users={users}
        onClose={() => setEditOpen(false)}
      />
      {statusOpen ? (
        <SalesStatusChangeModal
          product={product}
          onClose={() => setStatusOpen(false)}
          onSaved={() => setStatusOpen(false)}
        />
      ) : null}
    </>
  );
}
