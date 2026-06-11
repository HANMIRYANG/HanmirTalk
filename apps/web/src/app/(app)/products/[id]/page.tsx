import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { productService } from "@/services/product.service";
import { erpService } from "@/services/erp.service";
import { userService } from "@/services/user.service";
import { projectService } from "@/services/project.service";
import { requireServerMe } from "@/lib/server-auth";
import { salesStatusLabel } from "@hanmir/shared";
import { ProductActions } from "./ProductActions";
import { ProductTabs } from "./ProductTabs";
import styles from "./detail.module.css";

const WRITER_ROLES = new Set(["admin", "super_admin", "manager", "project_owner"]);

interface Props {
  params: { id: string };
}

export default async function ProductDetailPage({ params }: Props) {
  const { me, token } = await requireServerMe();
  const product = await productService.getProduct(params.id, { token });
  if (!product) notFound();

  // Phase 7 J-3 — DB-backed specs / sales-history.
  const [owner, relatedProjects, dbSpecs, dbHistory, dbDocuments, inventory] =
    await Promise.all([
      product.ownerId
        ? userService.getUser(product.ownerId, { token })
        : Promise.resolve(undefined),
      Promise.all(
        product.relatedProjectIds.map((id) => projectService.getProject(id, { token }))
      ).then((items) => items.filter((p): p is NonNullable<typeof p> => Boolean(p))),
      productService.listSpecs(params.id, { token }).catch(() => []),
      productService.listSalesHistory(params.id, { token }).catch(() => []),
      productService.listDocuments(params.id, { token }).catch(() => []),
      erpService.getInventorySummary(params.id, { token }).catch(() => undefined)
    ]);
  const canManage = WRITER_ROLES.has(me.role);

  return (
    <>
      <Topbar title="제품정보" sub={product.fullName} />

      <section className={styles.head}>
        <div className={styles.crumb}>
          <span>제품정보</span>
          <span>›</span>
          <b>{product.category}</b>
          <span>›</span>
          <b>{product.subCategory}</b>
        </div>
        <div className={styles.row}>
          <div className={styles.img}>{product.imageLabel ?? "PRODUCT IMG"}</div>
          <div className={styles.titleBlock}>
            <div className={styles.title}>
              {product.fullName} <small>{product.code}</small>
            </div>
            <div className={styles.subRow}>
              <Tag tone="blue">{product.category}</Tag>
              <span>{product.subCategory}</span>
              <span>·</span>
              {owner ? (
                <>
                  <span>·</span>
                  <span>제품 담당: {owner.name} {owner.position}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className={styles.actions}>
            {canManage ? <ProductActions product={product} /> : null}
          </div>
        </div>
      </section>

      <div className={styles.banner}>
        <div className={styles.bannerIc}>!</div>
        <div>
          <div className={styles.bannerTitle}>
            {salesStatusLabel[product.salesStatus]}
          </div>
          {product.salesNote ? (
            <div className={styles.bannerSub}>{product.salesNote}</div>
          ) : null}
        </div>
        <div className={styles.bannerDetail}>
          {product.salesUpdatedAt ? <b>{product.salesUpdatedAt}</b> : null}
          {product.salesUpdatedBy ? `${product.salesUpdatedBy} 상태 변경` : null}
        </div>
      </div>

      {inventory && inventory.variants.length > 0 ? (
        <section className={styles.inventoryCard}>
          <div className={styles.inventoryHead}>
            <b>재고 현황</b>
            <span className={styles.inventoryTotal}>
              총 {inventory.totalKg.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} kg
            </span>
          </div>
          <table className={styles.inventoryTable}>
            <thead>
              <tr>
                <th>규격</th>
                <th>단위</th>
                <th style={{ textAlign: "right" }}>수량</th>
                <th style={{ textAlign: "right" }}>kg</th>
              </tr>
            </thead>
            <tbody>
              {inventory.variants.map((v) => (
                <tr key={v.productVariantId}>
                  <td>{v.variantName}</td>
                  <td>{v.unitLabel}</td>
                  <td style={{ textAlign: "right" }}>
                    {v.totalQuantity.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {v.totalKg.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <ProductTabs
        product={product}
        specs={dbSpecs}
        salesHistory={dbHistory}
        documents={dbDocuments}
        relatedProjects={relatedProjects}
        owner={owner}
        meId={me.id}
        canManage={canManage}
      />
    </>
  );
}
