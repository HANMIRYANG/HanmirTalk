import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { erpService } from "@/services/erp.service";
import { apiBaseUrl } from "@/services/api-client";
import { requireServerMe } from "@/lib/server-auth";
import styles from "./erp.module.css";

function won(n: number): string {
  return n.toLocaleString("ko-KR");
}

function kg(n: number): string {
  return `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} kg`;
}

export default async function ErpHomePage() {
  const { me, token } = await requireServerMe();
  const isAdmin = me.role === "admin" || me.role === "super_admin";
  const [inventory, documents] = await Promise.all([
    erpService.listInventory({ token }).catch(() => []),
    erpService.listDocuments({ token, limit: 12 }).catch(() => [])
  ]);

  // 제품 단위 총 kg 집계.
  const byProduct = new Map<string, { name: string; totalKg: number; lines: number }>();
  for (const b of inventory) {
    const key = b.productId ?? b.productVariantId;
    const entry = byProduct.get(key) ?? {
      name: b.productName ?? "(제품 미지정)",
      totalKg: 0,
      lines: 0
    };
    entry.totalKg += b.quantityKg;
    entry.lines += 1;
    byProduct.set(key, entry);
  }
  const productRows = Array.from(byProduct.entries());

  return (
    <>
      <Topbar title="ERP" sub="재고 원장과 판매/사용 전표를 관리합니다." />
      <div className="content">
        <div className={styles.toolbar}>
          <div className={styles.toolbarMeta}>
            재고 품목 {inventory.length}건 · 전표 {documents.length}건
          </div>
          <div className={styles.toolbarActions}>
            <Link href="/erp/documents/new" className="btn btn--primary btn--sm">
              + 판매입력
            </Link>
            <a href={`${apiBaseUrl}/erp/exports/documents`} className="btn btn--ghost btn--sm">
              전표 Excel
            </a>
            <a href={`${apiBaseUrl}/erp/exports/inventory`} className="btn btn--ghost btn--sm">
              재고 Excel
            </a>
            {isAdmin ? (
              <Link href="/admin/erp" className="btn btn--ghost btn--sm">
                ERP 설정
              </Link>
            ) : null}
          </div>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>제품별 재고 요약</h2>
          {productRows.length === 0 ? (
            <div className={styles.empty}>
              등록된 재고가 없습니다. ERP 설정에서 규격·창고·초기 재고를 등록하세요.
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {productRows.map(([key, p]) => (
                <div key={key} className={styles.card}>
                  <div className={styles.cardTitle}>{p.name}</div>
                  <div className={styles.cardKg}>{kg(p.totalKg)}</div>
                  <div className={styles.cardMeta}>{p.lines}개 규격×창고</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>최근 전표</h2>
          {documents.length === 0 ? (
            <div className={styles.empty}>저장된 전표가 없습니다.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>전표번호</th>
                  <th>일자</th>
                  <th>유형</th>
                  <th>거래처</th>
                  <th className={styles.right}>공급가액</th>
                  <th className={styles.right}>부가세</th>
                  <th className={styles.right}>합계</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td className={styles.mono}>
                      <Link href={`/erp/documents/${d.id}`}>{d.documentNo}</Link>
                    </td>
                    <td>{d.documentDate}</td>
                    <td>{d.documentType === "use" ? "사용" : "판매"}</td>
                    <td>{d.customerName ?? "-"}</td>
                    <td className={styles.right}>{won(d.supplyAmount)}</td>
                    <td className={styles.right}>{won(d.vatAmount)}</td>
                    <td className={styles.right}>{won(d.totalAmount)}</td>
                    <td>
                      {d.status === "cancelled" ? (
                        <Tag tone="red">취소</Tag>
                      ) : (
                        <Tag tone="green">정상</Tag>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
