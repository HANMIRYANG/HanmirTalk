import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { projectService } from "@/services/project.service";
import { noticeService } from "@/services/notice.service";
import { chatService } from "@/services/chat.service";
import { dashboardService } from "@/services/dashboard.service";
import { taskService } from "@/services/task.service";
import { requireServerMe } from "@/lib/server-auth";
import { projectStatusLabel } from "@hanmir/shared";
import styles from "./dashboard.module.css";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

const PROJECT_TONE = {
  ready: "default" as const,
  in_progress: "blue" as const,
  review: "amber" as const,
  on_hold: "amber" as const,
  done: "green" as const,
  cancelled: "red" as const
};

export default async function DashboardPage() {
  // Phase 3 후속: layout과 동일하게 401 시 redirect로 깔끔 처리.
  // 이전엔 getMe(token)이 throw → console에 ApiError 출력 + 결국 layout이
  // 별도로 redirect하던 노이즈. requireServerMe는 토큰 없거나 만료면
  // 즉시 redirect("/login") 하므로 page의 다른 API 호출은 시작도 안 함.
  const { me, token } = await requireServerMe();
  const isAdmin = ADMIN_ROLES.has(me.role);

  const [projects, rooms, notices, activities, adminKpis] = await Promise.all([
    projectService.listProjects({ token }),
    chatService.listRooms({ token }),
    noticeService.listNotices({ token }),
    dashboardService.listDashboardActivities({ token }),
    isAdmin
      ? dashboardService.listAdminKpis({ token }).catch(() => [])
      : Promise.resolve([])
  ]);

  // Tasks assigned to me across all projects the user can see. We list each
  // project's tasks (lightweight call, server returns from cache/seed) and
  // filter for me-as-assignee + still-open.
  const taskBatches = await Promise.all(
    projects.slice(0, 8).map((p) =>
      taskService
        .listByProject(p.id, { token })
        .then((ts) =>
          ts
            .filter((t) => t.assigneeIds.includes(me.id) && t.status !== "done")
            .map((t) => ({ task: t, project: p }))
        )
        .catch(() => [])
    )
  );
  const myTasks = taskBatches.flat().slice(0, 6);

  const activeProjects = projects.filter((p) => p.status !== "done" && p.status !== "cancelled");
  const delayedTotal = projects.reduce((sum, p) => sum + (p.delayedCount ?? 0), 0);
  const noticesToConfirm = notices.filter((n) => n.isMandatory && !n.myConfirmed);
  const unreadRooms = rooms.filter((r) => r.unread > 0);
  const unreadTotal = unreadRooms.reduce((sum, r) => sum + r.unread, 0);

  return (
    <>
      <Topbar title="대시보드" sub={`${me.name}님, 오늘의 요약입니다.`} />
      <div className="content">
        <section className={styles.kpis}>
          <KpiCard
            label="내가 담당한 진행중 업무"
            value={myTasks.length}
            sub={delayedTotal > 0 ? `전사 지연 ${delayedTotal}건` : "지연 없음"}
          />
          <KpiCard
            label="진행중 프로젝트"
            value={activeProjects.length}
            sub={`완료/취소 제외 · 전체 ${projects.length}개`}
          />
          <KpiCard
            label="확인 필요 공지"
            value={noticesToConfirm.length}
            sub={notices.length > 0 ? `전체 공지 ${notices.length}건` : "최근 공지 없음"}
            href="/notices"
            tone={noticesToConfirm.length > 0 ? "danger" : undefined}
          />
          <KpiCard
            label="안 읽은 메시지"
            value={unreadTotal}
            sub={unreadRooms.length > 0 ? `${unreadRooms.length}개 대화방` : "모두 확인 완료"}
            href="/chat"
            tone={unreadTotal > 0 ? "danger" : undefined}
          />
        </section>

        <div className={styles.body}>
          <section className={styles.col}>
            <div className="card">
              <div className="card__head">
                <h3>내가 담당한 업무</h3>
                <span className="muted">상태: 완료 제외</span>
              </div>
              {myTasks.length === 0 ? (
                <div className={styles.empty}>현재 담당 중인 미완료 업무가 없습니다.</div>
              ) : (
                <ul className={styles.taskList}>
                  {myTasks.map(({ task, project }) => (
                    <li key={task.id} className={styles.taskRow}>
                      <div className={styles.taskCode}>{project.code}</div>
                      <Link
                        className={styles.taskTitle}
                        href={`/projects/${project.id}/tasks`}
                      >
                        {task.title}
                      </Link>
                      <Tag tone={task.dueState === "late" ? "red" : "default"}>
                        {task.dueLabel}
                      </Tag>
                      <div className={styles.taskProgress}>
                        <ProgressBar value={task.progress} />
                        <span>{task.progress}%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`card ${styles.spacedCard}`}>
              <div className="card__head">
                <h3>진행중 프로젝트</h3>
                <Link href="/projects" className="muted">
                  전체 보기 →
                </Link>
              </div>
              {activeProjects.length === 0 ? (
                <div className={styles.empty}>진행중인 프로젝트가 없습니다.</div>
              ) : (
                <ul className={styles.projList}>
                  {activeProjects.slice(0, 5).map((p) => (
                    <li key={p.id} className={styles.projRow}>
                      <div className={styles.projHead}>
                        <Link href={`/projects/${p.id}`} className={styles.projTitle}>
                          <b>{p.code}</b> {p.name}
                        </Link>
                        <Tag tone={PROJECT_TONE[p.status]} dot>
                          {projectStatusLabel[p.status]}
                        </Tag>
                      </div>
                      <div className={styles.projMeta}>
                        {p.department} · 책임 {p.ownerName} · 마감 {p.dueDate}
                      </div>
                      <div className={styles.projProgress}>
                        <ProgressBar value={p.progress} />
                        <span>{p.progress}%</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <aside className={styles.side}>
            <div className="card">
              <div className="card__head">
                <h3>최근 공지</h3>
                <Link href="/notices" className="muted">
                  전체 →
                </Link>
              </div>
              {notices.length === 0 ? (
                <div className={styles.empty}>최근 공지가 없습니다.</div>
              ) : (
                <ul className={styles.noticeList}>
                  {notices.slice(0, 5).map((n) => (
                    <li key={n.id} className={styles.noticeRow}>
                      <Tag tone={n.tone} dot>
                        {n.isMandatory ? "필독" : "공지"}
                      </Tag>
                      <span className={styles.noticeTitle}>{n.title}</span>
                      <span className={styles.noticeMeta}>
                        {n.authorTeam} · {n.createdAt}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`card ${styles.spacedCard}`}>
              <div className="card__head">
                <h3>최근 활동</h3>
              </div>
              {activities.length === 0 ? (
                <div className={styles.empty}>표시할 활동이 없습니다.</div>
              ) : (
                <ul className={styles.actList}>
                  {activities.slice(0, 6).map((a) => (
                    <li key={a.id} className={styles.actRow}>
                      <span className={styles.actAuthor}>{a.author}</span>
                      <span className={styles.actBody}>{a.body}</span>
                      <span className={styles.actTime}>{a.time}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isAdmin && adminKpis.length > 0 ? (
              <div className={`card ${styles.spacedCard}`}>
                <div className="card__head">
                  <h3>관리자 KPI</h3>
                </div>
                <ul className={styles.kpiList}>
                  {adminKpis.slice(0, 4).map((k) => (
                    <li key={k.label} className={styles.kpiListRow}>
                      <span>{k.label}</span>
                      <b>{k.value}</b>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  sub,
  href,
  tone
}: {
  label: string;
  value: number;
  sub?: string;
  href?: string;
  tone?: "danger";
}) {
  const inner = (
    <div className={`stat ${styles.kpiCard}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value" style={tone === "danger" ? { color: "var(--brand-orange)" } : undefined}>
        {value}
      </div>
      {sub ? <div className="t-xs muted" style={{ marginTop: 8 }}>{sub}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className={styles.kpiLink}>
      {inner}
    </Link>
  ) : (
    inner
  );
}
