"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductFormModal } from "./ProductFormModal";

interface ProductCreateButtonProps {
  label?: string;
  className?: string;
}

export function ProductCreateButton({
  label = "+ 제품 등록",
  className = "btn btn--primary btn--sm"
}: ProductCreateButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <ProductFormModal
        open={open}
        mode={{ kind: "create" }}
        onClose={() => setOpen(false)}
        onSubmitted={(p) => router.push(`/products/${p.id}`)}
      />
    </>
  );
}
