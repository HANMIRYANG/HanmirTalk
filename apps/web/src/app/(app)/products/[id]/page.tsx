import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { productService } from "@/services/product.service";
import { userService } from "@/services/user.service";
import { projectService } from "@/services/project.service";
import { authService } from "@/services/auth.service";
import { getServerToken } from "@/lib/server-auth";
import { salesStatusLabel } from "@hanmir/shared";
import { cn } from "@/lib/classNames";
import { ProductActions } from "./ProductActions";
import styles from "./detail.module.css";

const WRITER_ROLES = new Set(["admin", "super_admin", "manager", "project_owner"]);

interface Props {
  params: { id: string };
}

const TRC_TONE: Record<string, "blue" | "green" | "amber" | "red"> = {
  in_review: "amber",
  approved: "green",
  pending: "red"
};
const TRC_LABEL: Record<string, string> = {
  in_review: "검토중",
  approved: "결재",
  pending: "결과 미확정"
};

const VERDICT_TONE: Record<string, "green" | "amber" | "red"> = {
  pass: "green",
  hold: "amber",
  retest: "red"
};
const VERDICT_LABEL: Record<string, string> = {
  pass: "합격",
  hold: "보류",
  retest: "재시험"
};

export default async function ProductDetailPage({ params }: Props) {
  const token = getServerToken();
  const product = await productService.getProduct(params.id, { token });
  if (!product) notFound();

  const [owner, relatedProjects, me] = await Promise.all([
    product.ownerId ? userService.getUser(product.ownerId, { token }) : Promise.resolve(undefined),
    Promise.all(
      product.relatedProjectIds.map((id) => projectService.getProject(id, { token }))
    ).then((items) => items.filter((p): p is NonNullable<typeof p> => Boolean(p))),
    authService.getMe(token)
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
          <div>
            <div className={styles.title}>
              {product.fullName} <small>{product.code}</small>
            </div>
            <div className={styles.subRow}>
              <Tag tone="blue">{product.category}</Tag>
              <span>{product.subCategory}</span>
              <span>·</span>
              <span>주관 부서: 영업본부 1팀</span>
              <span>·</span>
              <span>제품 담당: {owner?.name} 책임</span>
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
            {salesStatusLabel[product.salesStatus]}{" "}
            <Tag tone="amber" className={styles.bannerTag}>
              CONDITIONAL
            </Tag>
          </div>
          <div className={styles.bannerSub}>{product.salesNote}</div>
        </div>
        <div className={styles.bannerDetail}>
          <b>{product.salesUpdatedAt}</b>
          {product.salesUpdatedBy}이 상태 변경
        </div>
        <button className="btn btn--ghost btn--sm" type="button">
          변경 이력 →
        </button>
      </div>

      <nav className={styles.tabs}>
        <div className={cn(styles.tab, styles.tabActive)}>제품 개요</div>
        <div className={styles.tab}>시험성적서</div>
        <div className={styles.tab}>생산 LOT</div>
        <div className={styles.tab}>영업 상태 이력</div>
        <div className={styles.tab}>관련 프로젝트</div>
        <div className={styles.tab}>문의 채팅</div>
      </nav>

      <div className="content no-pad">
        <div className={styles.body}>
          <div>
            <section className={cn("card", styles.section)}>
              <div className="card__head">
                <h3>영업 가능 상태 흐름</h3>
                <div className="right">
                  <Link href="#" className="btn btn--ghost btn--sm">
                    전체 이력 보기 →
                  </Link>
                </div>
              </div>
              <div className={styles.timeline}>
                {product.history.map((h) => (
                  <div key={h.id} className={styles.step}>
                    <div
                      className={cn(
                        styles.stepDot,
                        h.state === "done" && styles.stepDotDone,
                        h.state === "current" && styles.stepDotCurrent
                      )}
                    />
                    <div>
                      <div className={styles.stepTitle}>
                        {h.title}
                        {h.state === "current" ? (
                          <Tag tone="amber" className={styles.stepTag}>
                            현재 상태
                          </Tag>
                        ) : null}
                      </div>
                      <div className={styles.stepMeta}>{h.meta}</div>
                    </div>
                    <div className={styles.stepTime}>{h.date}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className={cn("card", styles.section)}>
              <div className="card__head">
                <h3>제품 사양</h3>
                <span className="muted t-xs">최근 갱신: 박지영 · 5월 11일</span>
                <div className="right">
                  <button className="btn btn--ghost btn--sm" type="button">
                    수정
                  </button>
                </div>
              </div>
              <table className={styles.specTable}>
                <tbody>
                  {product.spec.map((s) => (
                    <tr key={s.key}>
                      <th>{s.key}</th>
                      <td>{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={cn("card", styles.section)}>
              <div className="card__head">
                <h3>최근 생산 LOT</h3>
                <span className="muted t-xs">최근 6건</span>
                <div className="right">
                  <button className="btn btn--ghost btn--sm" type="button">
                    전체 LOT →
                  </button>
                </div>
              </div>
              <table className={styles.lotTable}>
                <thead>
                  <tr>
                    <th>LOT 번호</th>
                    <th>생산일</th>
                    <th>수량</th>
                    <th>시험성적서</th>
                    <th>판정</th>
                    <th>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {product.lots.map((lot) => (
                    <tr key={lot.id}>
                      <td className={styles.lotNum}>{lot.number}</td>
                      <td>{lot.producedAt}</td>
                      <td>{lot.quantity}</td>
                      <td>
                        <Tag tone={TRC_TONE[lot.trcStatus]} dot>
                          {lot.trcVersion}
                        </Tag>
                      </td>
                      <td>
                        <Tag tone={VERDICT_TONE[lot.verdict]}>
                          {VERDICT_LABEL[lot.verdict]}
                        </Tag>
                      </td>
                      <td className="muted">{lot.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <aside className={styles.side}>
            <section className={styles.sideCard}>
              <h4>이번 분기 판매 현황</h4>
              <div className={styles.statRow}>
                <span className={styles.k}>총 판매량</span>
                <span className={styles.v}>{product.quarter.totalKg}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.k}>매출액</span>
                <span className={styles.v}>{product.quarter.revenue}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.k}>평균 단가</span>
                <span className={styles.v}>{product.quarter.avgPrice}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.k}>상위 거래처</span>
                <span className={styles.v}>{product.quarter.topClient}</span>
              </div>
              <ProgressBar value={product.quarter.targetRatio} className={styles.sideProgress} />
              <div className="t-xs muted mt-4">분기 목표 대비 {product.quarter.targetRatio}%</div>
            </section>

            <section className={styles.sideCard}>
              <h4>관련 프로젝트</h4>
              <div className={styles.relList}>
                {relatedProjects.map((pj) => (
                  <Link key={pj.id} href={`/projects/${pj.id}`} className={styles.relItem}>
                    <div className={styles.relTitle}>
                      {pj.code} {pj.name}
                    </div>
                    <div className={styles.relMeta}>
                      진행률 {pj.progress}% · 마감 {pj.dueDate.slice(5)}
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <section className={styles.sideCard}>
              <h4>최근 시험성적서</h4>
              {product.documents.map((d) => (
                <div key={d.id} className={styles.fileRow}>
                  <div className={styles.fileIc}>PDF</div>
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <div className={styles.fileName}>{d.name}</div>
                    <div className={styles.fileMeta}>{d.meta}</div>
                  </div>
                </div>
              ))}
            </section>

            {owner ? (
              <section className={styles.sideCard}>
                <h4>제품 담당자</h4>
                <div className={styles.ownerRow}>
                  <Avatar
                    initials={owner.initials}
                    tone={owner.avatarTone ?? "default"}
                    size="lg"
                  />
                  <div>
                    <div className={styles.ownerName}>
                      {owner.name} {owner.position}
                    </div>
                    <div className={styles.ownerMeta}>{owner.departmentName}</div>
                  </div>
                </div>
                <button className="btn btn--outline btn--sm mt-12" style={{ width: "100%" }} type="button">
                  1:1 대화 시작
                </button>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
