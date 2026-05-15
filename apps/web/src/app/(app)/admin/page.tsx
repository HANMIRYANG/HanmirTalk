import { redirect } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ChatIcon } from "@/components/ui/icons";
import { userService } from "@/services/user.service";
import { departmentService } from "@/services/department.service";
import { dashboardService } from "@/services/dashboard.service";
import { authService } from "@/services/auth.service";
import { getServerToken } from "@/lib/server-auth";
import { cn } from "@/lib/classNames";
import { UsersAdminCard } from "./UsersAdminCard";
import { DepartmentsAdminCard } from "./DepartmentsAdminCard";
import styles from "./admin.module.css";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export default async function AdminPage() {
  const token = getServerToken();
  const me = await authService.getMe(token);
  if (!ADMIN_ROLES.has(me.role)) redirect("/chat");

  const [users, departments, kpis, audit, deptStats] = await Promise.all([
    userService.listUsers({ token }),
    departmentService.listDepartments({ token }),
    dashboardService.listAdminKpis({ token }),
    dashboardService.listAudit({ token }),
    dashboardService.listDeptStats({ token })
  ]);

  return (
    <div className={styles.layout}>
      <aside className={styles.anav}>
        <div className={styles.anavTitle}>개요</div>
        <div className={cn(styles.anavItem, styles.anavActive)}>
          <ChatIcon size={14} />
          관리자 대시보드
        </div>

        <div className={styles.anavTitle} style={{ marginTop: 10 }}>
          사용자
        </div>
        <div className={styles.anavItem}>계정 관리</div>
        <div className={styles.anavItem}>권한 / 역할</div>
        <div className={styles.anavItem}>부서 관리</div>
        <div className={styles.anavItem}>초대 / 가입 승인</div>

        <div className={styles.anavTitle} style={{ marginTop: 10 }}>
          콘텐츠
        </div>
        <div className={styles.anavItem}>프로젝트 관리</div>
        <div className={styles.anavItem}>채팅방 관리</div>
        <div className={styles.anavItem}>공지 발송 관리</div>
        <div className={styles.anavItem}>제품정보 관리</div>

        <div className={styles.anavTitle} style={{ marginTop: 10 }}>
          정책
        </div>
        <div className={styles.anavItem}>파일 / 보존 정책</div>
        <div className={styles.anavItem}>보안 / 로그인</div>
        <div className={styles.anavItem}>감사 로그</div>
        <div className={styles.anavItem}>알림 정책</div>

        <div className={styles.anavTitle} style={{ marginTop: 10 }}>
          시스템
        </div>
        <div className={styles.anavItem}>서비스 상태</div>
        <div className={styles.anavItem}>버전 / 업데이트</div>
      </aside>

      <main className={styles.main}>
        <Topbar title="관리자" sub="한미르톡 운영 현황" />

        <section className={styles.ahead}>
          <h1>관리자 대시보드</h1>
          <div className={styles.aheadSub}>
            한미르주식회사 전사 한미르톡 운영 현황 · 2026.05.13 기준
          </div>
        </section>

        <div className={cn("content", styles.content)}>
          <div className={styles.kpiRow}>
            {kpis.map((k) => (
              <div key={k.label} className={styles.kpi}>
                <div className={styles.kpiLabel}>{k.label}</div>
                <div
                  className={cn(
                    styles.kpiValue,
                    k.highlight === "warn" && styles.kpiWarn,
                    k.highlight === "danger" && styles.kpiDanger
                  )}
                >
                  {k.value}
                </div>
                <div className={styles.kpiSub}>
                  {k.sub}
                  {k.progress != null ? (
                    <ProgressBar value={k.progress} className={styles.kpiProgress} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.grid2}>
            <UsersAdminCard initialUsers={users} departments={departments} />

            <div className="col gap-16">
              <section className="card">
                <div className="card__head">
                  <h3>감사 로그 (Audit)</h3>
                  <span className="muted t-xs">최근 24시간</span>
                  <div className="right">
                    <button className="btn btn--ghost btn--sm" type="button">
                      전체 →
                    </button>
                  </div>
                </div>
                <div className={styles.audit}>
                  {audit.map((a) => (
                    <div key={a.id} className={styles.auditRow}>
                      <div
                        className={cn(
                          styles.auditIcon,
                          a.level === "warn" && styles.auditWarn,
                          a.level === "danger" && styles.auditDanger
                        )}
                      >
                        {a.level === "warn" ? "!" : a.level === "danger" ? "×" : "✓"}
                      </div>
                      <div>
                        <div className={styles.auditTitle}>{a.title}</div>
                        <div className={styles.auditMeta}>{a.meta}</div>
                      </div>
                      <div className={styles.auditTime}>{a.time}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card">
                <div className="card__head">
                  <h3>부서별 현황</h3>
                </div>
                <div>
                  {deptStats.map((d) => (
                    <div key={d.name} className={styles.deptRow}>
                      <div>
                        <div className={styles.deptName}>{d.name}</div>
                        <div className={styles.deptSub}>{d.sub}</div>
                      </div>
                      <div className={styles.deptCount}>{d.count}명</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <DepartmentsAdminCard initialDepartments={departments} />
        </div>
      </main>
    </div>
  );
}
