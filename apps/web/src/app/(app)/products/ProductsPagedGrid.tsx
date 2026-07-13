"use client";

import { useState } from "react";
import Link from "next/link";
import type { Product } from "@hanmir/shared";
import { salesStatusLabel } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Pagination } from "@/components/ui/Pagination";
import { apiBaseUrl } from "@/services/api-client";
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
  view: "grid" | "list";
}

export function ProductsPagedGrid({ products, view }: ProductsPagedGridProps) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged =
    products.length > PAGE_SIZE
      ? products.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
      : products;

  if (view === "list") {
    return (
      <>
        <div className={styles.list}>
          {paged.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`} className={styles.row}>
              {p.imageAttachmentId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={styles.rowThumb}
                  src={`${apiBaseUrl}/files/${p.imageAttachmentId}/download`}
                  alt={p.name}
                  style={{ objectFit: "contain", background: "#fff" }}
                />
              ) : (
                <div className={styles.rowThumb} />
              )}
              <div className={styles.rowName}>
                <span className={styles.rowTitle}>{p.fullName}</span>
              </div>
              <div className={styles.rowCategory}>{p.subCategory}</div>
              <div className={styles.rowStatus}>
                <Tag tone={SALES_TONE[p.salesStatus]} dot>
                  {salesStatusLabel[p.salesStatus]}
                </Tag>
              </div>
            </Link>
          ))}
        </div>
        <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
      </>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {paged.map((p) => (
          <Link key={p.id} href={`/products/${p.id}`} className={styles.card}>
            {p.imageAttachmentId ? (
              // 대표 이미지(product_documents type=image). next/image 는
              // 최적화 프록시가 쿠키 없이 재요청해 401 — native img 사용.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.thumb}
                src={`${apiBaseUrl}/files/${p.imageAttachmentId}/download`}
                alt={p.name}
                style={{ objectFit: "contain", background: "#fff" }}
              />
            ) : (
              <div className={styles.thumb}>{p.imageLabel ?? "PRODUCT"}</div>
            )}
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
