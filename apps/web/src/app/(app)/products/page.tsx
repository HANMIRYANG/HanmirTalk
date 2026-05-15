import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { productService } from "@/services/product.service";
import { getServerToken } from "@/lib/server-auth";
import { salesStatusLabel } from "@hanmir/shared";
import styles from "./products.module.css";

const SALES_TONE = {
  unavailable: "red" as const,
  preparing: "amber" as const,
  internal: "blue" as const,
  conditional: "amber" as const,
  available: "green" as const
};

export default async function ProductListPage() {
  const token = getServerToken();
  const products = await productService.listProducts({ token });

  return (
    <>
      <Topbar title="제품정보" sub="제품별 영업 가능 상태와 자료를 확인하세요." />
      <div className="content">
        <div className={styles.grid}>
          {products.map((p) => (
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
                담당: 최도현 책임 · 분기 매출 {p.quarter.revenue}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
