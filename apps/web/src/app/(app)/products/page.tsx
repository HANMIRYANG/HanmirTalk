import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { productService } from "@/services/product.service";
import { authService } from "@/services/auth.service";
import { getServerToken } from "@/lib/server-auth";
import { salesStatusLabel } from "@hanmir/shared";
import { ProductCreateButton } from "./ProductCreateButton";
import styles from "./products.module.css";

const WRITER_ROLES = new Set(["admin", "super_admin", "manager", "project_owner"]);

const SALES_TONE = {
  unavailable: "red" as const,
  preparing: "amber" as const,
  internal: "blue" as const,
  conditional: "amber" as const,
  available: "green" as const
};

export default async function ProductListPage() {
  const token = getServerToken();
  const [products, me] = await Promise.all([
    productService.listProducts({ token }),
    authService.getMe(token)
  ]);
  const canManage = WRITER_ROLES.has(me.role);

  return (
    <>
      <Topbar title="제품정보" sub="제품별 영업 가능 상태와 자료를 확인하세요." />
      <div className="content">
        <div className={styles.toolbar}>
          <div className={styles.toolbarMeta}>{products.length}개 제품</div>
          {canManage ? <ProductCreateButton /> : null}
        </div>
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
