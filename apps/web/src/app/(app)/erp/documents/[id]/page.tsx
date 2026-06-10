import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { erpService } from "@/services/erp.service";
import { requireServerMe } from "@/lib/server-auth";
import styles from "../../erp.module.css";
import { CancelDocumentButton } from "./CancelDocumentButton";

function won(n: number): string {
  return n.toLocaleString("ko-KR");
}

interface Props {
  params: { id: string };
}

export default async function ErpDocumentDetailPage({ params }: Props) {
  const { me, token } = await requireServerMe();
  const doc = await erpService.getDocument(params.id, { token });
  if (!doc) notFound();

  const isAdmin = me.role === "admin" || me.role === "super_admin";
  const canCancel = doc.status === "active";

  return (
    <>
      <Topbar title={`전표 ${doc.documentNo}`} sub={doc.customerName ?? undefined} />
      <div className="content">
        <div className={styles.toolbar}>
          <div className={styles.toolbarMeta}>
            <Link href="/erp">← ERP</Link>
          </div>
          <div className={styles.toolbarActions}>
            {doc.status === "cancelled" ? (
              <Tag tone="red">취소됨</Tag>
            ) : (
              <Tag tone="green">정상</Tag>
            )}
            {canCancel ? <CancelDocumentButton id={doc.id} adminHint={isAdmin} /> : null}
          </div>
        </div>

        <div className={styles.headerGrid}>
          <div className={styles.field}><label>전표번호</label><div>{doc.documentNo}</div></div>
          <div className={styles.field}><label>일자</label><div>{doc.documentDate}</div></div>
          <div className={styles.field}><label>유형</label><div>{doc.documentType === "use" ? "사용" : "판매"}</div></div>
          <div className={styles.field}><label>거래처</label><div>{doc.customerName ?? "-"}</div></div>
          <div className={styles.field}><label>담당자</label><div>{doc.managerName ?? "-"}</div></div>
          <div className={styles.field}><label>출하창고</label><div>{doc.warehouseName ?? "-"}</div></div>
          <div className={styles.field}><label>거래유형</label><div>{doc.transactionType ?? "-"}</div></div>
          <div className={styles.field}><label>통화</label><div>{doc.currency}</div></div>
        </div>

        <table className={styles.lineTable} style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>#</th>
              <th>품목명</th>
              <th>규격</th>
              <th className={styles.num}>수량</th>
              <th className={styles.num}>단가</th>
              <th className={styles.num}>공급가액</th>
              <th className={styles.num}>부가세</th>
              <th>적요</th>
              <th>시리얼/로트</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.lineNo}</td>
                <td>{l.itemName ?? "-"}</td>
                <td>{l.specLabel ?? "-"}</td>
                <td className={styles.num}>{won(l.quantity)}</td>
                <td className={styles.num}>{won(l.unitPrice)}</td>
                <td className={styles.num}>{won(l.supplyAmount)}</td>
                <td className={styles.num}>{won(l.vatAmount)}</td>
                <td>{l.note ?? "-"}</td>
                <td>{l.serialLot ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.totals}>
          <div><span>공급가액</span>{won(doc.supplyAmount)}</div>
          <div><span>부가세</span>{won(doc.vatAmount)}</div>
          <div><span>합계</span>{won(doc.totalAmount)}</div>
        </div>
      </div>
    </>
  );
}
