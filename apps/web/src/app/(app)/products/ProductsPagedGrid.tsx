"use client";

import { useState } from "react";
import Link from "next/link";
import type { Product } from "@hanmir/shared";
import { salesStatusLabel } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Pagination } from "@/components/ui/Pagination";
import styles from "./products.module.css";

const PAGE_SIZE = 12;

const SALES_TONE = {
  unavailable: "red" as const,
  preparing: "amber" as const,
  internal: "blue" as const,
  conditional: "amber" as const,
  available: "green" as const
};

interface ProductsPagedGridProps {
  products: Product[];
}

export function ProductsPagedGrid({ products }: ProductsPagedGridProps) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged =
    products.length > PAGE_SIZE
      ? products.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
      : products;

  return (
    <>
      <div className={styles.grid}>
        {paged.map((p) => (
          <Link key={p.id} href={`/products/${p.id}`} className={styles.card}>
            <div className={styles.thumb}>{p.imageLabel ?? "PRODUCT"}</div>
            <div>
              <div className={styles.title}>{p.fullName}</div>
              <div className={styles.code}>{p.code}</div>
            </div>
            <div className={styles.meta}>{p.subCategory}</div>
            <div className={styles.statusRow}>
              <Tag tone={SALES_TONE[p.salesStatus]} dot>
                {salesStatusLabel[p.salesStatus]}
              </Tag>
            </div>
            <div className={styles.foot}>
              {p.quarter?.revenue ? `분기 매출 ${p.quarter.revenue}` : "등록된 제품 정보"}
            </div>
          </Link>
        ))}
      </div>
      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
    </>
  );
}
