"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  Product,
  ProductDocument,
  ProductSpec,
  Project,
  SalesStatus,
  SalesStatusEvent,
  User
} from "@hanmir/shared";
import { salesStatusLabel } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { ProgressBar } from "@/components/ui/ProgressBar";
import dynamic from "next/dynamic";
import { ProductOwnerChatButton } from "./ProductOwnerChatButton";

// 모달 2종은 열 때만 로드 — 초기 번들에서 제외 (조건부 렌더라 청크는
// 버튼 클릭 시점에 받아온다).
const ProductSpecsModal = dynamic(
  () => import("./ProductSpecsModal").then((m) => m.ProductSpecsModal),
  { ssr: false }
);
const ProductDocumentUploadModal = dynamic(
  () => import("./ProductDocumentUploadModal").then((m) => m.ProductDocumentUploadModal),
  { ssr: false }
);
import { fileService } from "@/services/file.service";
import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import styles from "./detail.module.css";

type Tab = "overview" | "test_reports" | "sales_history" | "related" | "inquiry";

interface Props {
  product: Product;
  specs: ProductSpec[];
  salesHistory: SalesStatusEvent[];
  documents: ProductDocument[];
  relatedProjects: Project[];
  owner?: User;
  meId: string;
  canManage: boolean;
}

const SALES_TONE: Record<SalesStatus, "green" | "amber" | "red" | "blue" | "default"> = {
  unavailable: "red",
  preparing: "amber",
  internal: "blue",
  conditional: "amber",
  available: "green"
};

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "제품 개요" },
  { key: "test_reports", label: "시험성적서" },
  { key: "sales_history", label: "영업 상태 이력" },
  { key: "related", label: "관련 프로젝트" },
  { key: "inquiry", label: "문의 채팅" }
];

export function ProductTabs({
  product,
  specs: initialSpecs,
  salesHistory,
  documents,
  relatedProjects,
  owner,
  meId,
  canManage
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [specsOpen, setSpecsOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const onDeleteDocument = async (doc: ProductDocument) => {
    if (deletingDocId) return;
    if (!window.confirm(`'${doc.fileName}'을(를) 삭제하시겠습니까? 파일도 함께 삭제됩니다.`)) {
      return;
    }
    setDeletingDocId(doc.id);
    setDocError(null);
    try {
      await productService.deleteDocument(product.id, doc.id);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setDocError("문서 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setDeletingDocId(null);
    }
  };

  const specs = initialSpecs;
  const history = salesHistory;

  // Phase 7 J-2 — DB-backed product_documents (document_type='test_report').
  const testReports = documents.filter((d) => d.documentType === "test_report");

  return (
    <>
      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={cn(styles.tab, tab === t.key && styles.tabActive)}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="content no-pad">
        <div className={styles.body}>
          <div>
            {tab === "overview" ? (
              <>
                <section className={cn("card", styles.section)}>
                  <div className="card__head">
                    <h3>제품 사양</h3>
                    {canManage ? (
                      <div className="right">
                        <button
                          className="btn btn--ghost btn--sm"
                          type="button"
                          onClick={() => setSpecsOpen(true)}
                        >
                          수정
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {specs.length === 0 ? (
                    <div className="muted t-sm" style={{ padding: 16 }}>
                      등록된 사양이 없습니다.
                    </div>
                  ) : (
                    <table className={styles.specTable}>
                      <tbody>
                        {specs.map((s) => (
                          <tr key={s.id}>
                            <th>{s.key}</th>
                            <td>{s.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
                {history.length > 0 ? (
                  <section className={cn("card", styles.section)}>
                    <div className="card__head">
                      <h3>최근 영업 상태</h3>
                      <div className="right">
                        <button
                          className="btn btn--ghost btn--sm"
                          type="button"
                          onClick={() => setTab("sales_history")}
                        >
                          전체 이력 →
                        </button>
                      </div>
                    </div>
                    <div className={styles.timeline}>
                      {history.slice(0, 3).map((h, i) => (
                        <div key={h.id} className={styles.step}>
                          <div
                            className={cn(
                              styles.stepDot,
                              i === 0 && styles.stepDotCurrent,
                              i > 0 && styles.stepDotDone
                            )}
                          />
                          <div>
                            <div className={styles.stepTitle}>
                              {h.fromStatus ? `${salesStatusLabel[h.fromStatus]} → ` : ""}
                              {salesStatusLabel[h.toStatus]}
                              {i === 0 ? (
                                <Tag tone="amber" className={styles.stepTag}>
                                  현재 상태
                                </Tag>
                              ) : null}
                            </div>
                            {h.reason ? <div className={styles.stepMeta}>{h.reason}</div> : null}
                          </div>
                          <div className={styles.stepTime}>{formatDate(h.changedAt)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : null}

            {tab === "test_reports" ? (
              <section className={cn("card", styles.section)}>
                <div className="card__head">
                  <h3>시험성적서</h3>
                  <span className="muted t-xs">{testReports.length}건</span>
                  {canManage ? (
                    <div className="right">
                      <button
                        className="btn btn--primary btn--sm"
                        type="button"
                        onClick={() => setDocModalOpen(true)}
                      >
                        + 시험성적서 업로드
                      </button>
                    </div>
                  ) : null}
                </div>
                {docError ? (
                  <div
                    className="t-xs"
                    style={{ padding: "0 16px 8px", color: "#DC2626" }}
                    role="alert"
                  >
                    {docError}
                  </div>
                ) : null}
                {testReports.length === 0 ? (
                  <div className="muted t-sm" style={{ padding: 16 }}>
                    등록된 시험성적서가 없습니다.
                    {canManage ? " 위 버튼으로 PDF를 업로드하세요." : ""}
                  </div>
                ) : (
                  <ul className={styles.docList}>
                    {testReports.map((d) => (
                      <li key={d.id} className={styles.docRow}>
                        <div className={styles.docIc}>{d.fileKind.toUpperCase()}</div>
                        <div className={styles.docMeta}>
                          <a className={styles.docName} href={fileService.downloadUrl(d.attachmentId)}>
                            {d.fileName}
                          </a>
                          <div className={styles.docSub}>
                            {d.sizeLabel}
                            {d.uploadedByName ? ` · ${d.uploadedByName}` : ""}
                            {d.createdAt ? ` · ${formatDate(d.createdAt)}` : ""}
                          </div>
                        </div>
                        {canManage ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => onDeleteDocument(d)}
                            disabled={deletingDocId === d.id}
                          >
                            {deletingDocId === d.id ? "삭제 중..." : "삭제"}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {tab === "sales_history" ? (
              <section className={cn("card", styles.section)}>
                <div className="card__head">
                  <h3>영업 상태 이력</h3>
                  <span className="muted t-xs">{history.length}건</span>
                </div>
                {history.length === 0 ? (
                  <div className="muted t-sm" style={{ padding: 16 }}>
                    상태 변경 이력이 없습니다.
                  </div>
                ) : (
                  <div className={styles.timeline}>
                    {history.map((h, i) => (
                      <div key={h.id} className={styles.step}>
                        <div
                          className={cn(
                            styles.stepDot,
                            i === 0 && styles.stepDotCurrent,
                            i > 0 && styles.stepDotDone
                          )}
                        />
                        <div>
                          <div className={styles.stepTitle}>
                            {h.fromStatus ? `${salesStatusLabel[h.fromStatus]} → ` : ""}
                            <Tag tone={SALES_TONE[h.toStatus]} dot>
                              {salesStatusLabel[h.toStatus]}
                            </Tag>
                          </div>
                          {h.reason ? <div className={styles.stepMeta}>{h.reason}</div> : null}
                          {h.changedByName ? (
                            <div className={styles.stepMeta}>
                              변경자: {h.changedByName}
                            </div>
                          ) : null}
                        </div>
                        <div className={styles.stepTime}>{formatDate(h.changedAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {tab === "related" ? (
              <section className={cn("card", styles.section)}>
                <div className="card__head">
                  <h3>관련 프로젝트</h3>
                  <span className="muted t-xs">{relatedProjects.length}건</span>
                </div>
                {relatedProjects.length === 0 ? (
                  <div className="muted t-sm" style={{ padding: 16 }}>
                    이 제품과 연결된 프로젝트가 없습니다.
                  </div>
                ) : (
                  <ul className={styles.docList}>
                    {relatedProjects.map((pj) => (
                      <li key={pj.id}>
                        <Link href={`/projects/${pj.id}`} className={styles.relItem}>
                          <div className={styles.relTitle}>
                            {pj.code} {pj.name}
                          </div>
                          <div className={styles.relMeta}>
                            진행률 {pj.progress}% · 마감 {pj.dueDate || "미정"}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {tab === "inquiry" ? (
              <section className={cn("card", styles.section)}>
                <div className="card__head">
                  <h3>문의 채팅</h3>
                </div>
                <div style={{ padding: 16 }}>
                  {owner ? (
                    <>
                      <p className="muted t-sm" style={{ marginBottom: 12 }}>
                        제품 담당자 <b>{owner.name}</b>님과 1:1 대화를 시작합니다. 이미
                        DM이 있으면 기존 방으로 이동합니다.
                      </p>
                      <ProductOwnerChatButton ownerId={owner.id} isSelf={owner.id === meId} />
                    </>
                  ) : (
                    <p className="muted t-sm">제품 담당자가 지정되어 있지 않습니다.</p>
                  )}
                </div>
              </section>
            ) : null}
          </div>

          <aside className={styles.side}>
            <section className={styles.sideCard}>
              <h4>이번 분기 판매 현황</h4>
              <div className={styles.statRow}>
                <span className={styles.k}>총 판매량</span>
                <span className={styles.v}>{product.quarter.totalKg || "—"}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.k}>매출액</span>
                <span className={styles.v}>{product.quarter.revenue || "—"}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.k}>평균 단가</span>
                <span className={styles.v}>{product.quarter.avgPrice || "—"}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.k}>상위 거래처</span>
                <span className={styles.v}>{product.quarter.topClient || "—"}</span>
              </div>
              <ProgressBar
                value={product.quarter.targetRatio}
                className={styles.sideProgress}
              />
              <div className="t-xs muted mt-4">분기 목표 대비 {product.quarter.targetRatio}%</div>
            </section>

            {owner ? (
              <section className={styles.sideCard}>
                <h4>제품 담당자</h4>
                <div className={styles.ownerRow}>
                  <div>
                    <div className={styles.ownerName}>
                      {owner.name} {owner.position}
                    </div>
                    <div className={styles.ownerMeta}>{owner.departmentName}</div>
                  </div>
                </div>
                <ProductOwnerChatButton ownerId={owner.id} isSelf={owner.id === meId} />
              </section>
            ) : null}
          </aside>
        </div>
      </div>

      {specsOpen ? (
        <ProductSpecsModal
          productId={product.id}
          initial={specs}
          onClose={() => setSpecsOpen(false)}
          onSaved={() => {
            setSpecsOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      {docModalOpen ? (
        <ProductDocumentUploadModal
          productId={product.id}
          documentType="test_report"
          onClose={() => setDocModalOpen(false)}
          onSaved={() => {
            setDocModalOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
