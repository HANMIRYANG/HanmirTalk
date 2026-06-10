import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { userService } from "@/services/user.service";
import { departmentService } from "@/services/department.service";
import { dashboardService } from "@/services/dashboard.service";
import { requireServerMe } from "@/lib/server-auth";
import { cn } from "@/lib/classNames";
import { UsersAdminCard } from "./UsersAdminCard";
import { DepartmentsAdminCard } from "./DepartmentsAdminCard";
import styles from "./admin.module.css";

// Role guard + admin shell live in ./layout.tsx; this page is just the
// dashboard content.
export default async function AdminPage() {
  const { token } = await requireServerMe();

  const [users, departments, kpis, audit, deptStats] = await Promise.all([
    userService.listUsers({ token }),
    departmentService.listDepartments({ token }),
    dashboardService.listAdminKpis({ token }),
    dashboardService.listAudit({ token }),
    dashboardService.listDeptStats({ token })
  ]);

  return (
    <>
      <Topbar title="관리자" sub="한미르톡 운영 현황" />

      <section className={styles.ahead} id="dashboard-top">
        <h1>관리자 대시보드</h1>
        <div className={styles.aheadSub}>
          한미르주식회사 전사 한미르톡 운영 현황 · 실시간 기준
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
          <div id="users">
            <UsersAdminCard initialUsers={users} departments={departments} />
          </div>

          <div className="col gap-16">
            <section className="card" id="audit">
              <div className="card__head">
                <h3>감사 로그 (Audit)</h3>
                <span className="muted t-xs">최근 활동</span>
                <div className="right">
                  <Link href="/admin/audit" className="muted t-xs">
                    전체 보기 →
                  </Link>
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

        <div id="departments">
          <DepartmentsAdminCard initialDepartments={departments} />
        </div>
      </div>
    </>
  );
}
