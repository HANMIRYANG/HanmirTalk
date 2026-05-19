import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { ChatList } from "@/components/chat/ChatList";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { chatService } from "@/services/chat.service";
import { dashboardService } from "@/services/dashboard.service";
import { noticeService } from "@/services/notice.service";
import { projectService } from "@/services/project.service";
import { taskService } from "@/services/task.service";
import { requireServerMe } from "@/lib/server-auth";
import styles from "./chat.module.css";

// Auth guard is enforced in apps/web/src/app/(app)/layout.tsx.
// Here we just need the token for downstream API calls.
export default async function ChatHomePage() {
  const { me, token } = await requireServerMe();
  const [rooms, activities, notices, projects] = await Promise.all([
    chatService.listRooms({ token }),
    dashboardService.listDashboardActivities({ token }),
    noticeService.listNotices({ token }),
    projectService.listProjects({ token })
  ]);

  // Tasks-due-soon: scan a slice of projects the caller can see and pick
  // their assignments that are late or due today.
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
  const myActiveTasks = taskBatches.flat();
  const dueSoonTasks = myActiveTasks
    .filter((x) => x.task.dueState === "late" || x.task.dueState === "today")
    .slice(0, 5);

  const unreadMessageTotal = rooms.reduce((sum, r) => sum + r.unread, 0);
  const activeProjects = projects.filter(
    (p) => p.status !== "done" && p.status !== "cancelled"
  );
  const myProjects = activeProjects.filter((p) => p.memberIds.includes(me.id));
  const noticesToConfirm = notices.filter((n) => n.isMandatory && !n.myConfirmed);
  const dateLabel = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });

  return (
    <>
      <div className={styles.row}>
        <ChatList rooms={rooms} />
        <main className={styles.main}>
          <Topbar title="채팅" sub={`${rooms.length}개 대화방`} />
          <div className="content">
            <div className={styles.dash}>
              <div className={styles.hello}>
                안녕하세요, <em>{me.name}</em> {me.position}님 👋
              </div>
              <div className={styles.helloSub}>
                오늘은 {dateLabel} · 오늘의 업무 현황을 알려드립니다.
              </div>

              <div className={styles.statGrid}>
                <div className="stat">
                  <div className="stat__label">읽지 않은 메시지</div>
                  <div className="stat__value">{unreadMessageTotal}</div>
                  <div className="stat__sub">
                    {rooms.filter((r) => r.unread > 0).length}개 대화방
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">진행 중인 프로젝트</div>
                  <div className="stat__value">{activeProjects.length}</div>
                  <div className="stat__sub">
                    내가 참여 {myProjects.length}건
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">오늘/지연 업무</div>
                  <div className="stat__value">{dueSoonTasks.length}</div>
                  <div className="stat__sub">
                    {dueSoonTasks.filter((x) => x.task.dueState === "late").length > 0 ? (
                      <>
                        <b className="alert">
                          지연 {dueSoonTasks.filter((x) => x.task.dueState === "late").length}건
                        </b>
                      </>
                    ) : (
                      "지연 없음"
                    )}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">확인 필요 공지</div>
                  <div className="stat__value">{noticesToConfirm.length}</div>
                  <div className="stat__sub">
                    전체 공지 {notices.length}건
                  </div>
                </div>
              </div>

              <div className={styles.dashGrid}>
                <section className="card">
                  <div className="card__head">
                    <div>
                      <div className="card__title">오늘의 업무</div>
                      <div className="card__sub">{me.name} · {dateLabel} 기준</div>
                    </div>
                    <Link
                      href="/dashboard"
                      className="btn btn--ghost btn--sm"
                      style={{ marginLeft: "auto" }}
                    >
                      대시보드 →
                    </Link>
                  </div>
                  <div className={styles.cardBody}>
                    {dueSoonTasks.length === 0 ? (
                      <div className={styles.emptyRow}>
                        오늘/지연 업무가 없습니다.
                      </div>
                    ) : (
                      dueSoonTasks.map(({ task, project }) => (
                        <Link
                          key={task.id}
                          href={`/projects/${project.id}/tasks`}
                          className={styles.noticeRow}
                        >
                          <div>
                            <div className={styles.noticeTitle}>{task.title}</div>
                            <div className={styles.noticeMeta}>
                              {project.code} {project.name} · 진행률 {task.progress}%
                            </div>
                          </div>
                          <Tag tone={task.dueState === "late" ? "red" : "amber"} dot>
                            {task.dueLabel}
                          </Tag>
                        </Link>
                      ))
                    )}
                  </div>
                </section>

                <section className="card">
                  <div className="card__head">
                    <div>
                      <div className="card__title">확인이 필요한 공지</div>
                      <div className="card__sub">필독·전체 공지</div>
                    </div>
                    <Link
                      href="/notices"
                      className="btn btn--ghost btn--sm"
                      style={{ marginLeft: "auto" }}
                    >
                      전체 →
                    </Link>
                  </div>
                  <div className={styles.cardBody}>
                    {notices.length === 0 ? (
                      <div className={styles.emptyRow}>최근 공지가 없습니다.</div>
                    ) : (
                      notices.slice(0, 5).map((n) => (
                        <div key={n.id} className={styles.noticeRow}>
                          <div>
                            <div className={styles.noticeTitle}>{n.title}</div>
                            <div className={styles.noticeMeta}>
                              {n.authorTeam} · {n.createdAt}
                            </div>
                          </div>
                          <Tag tone={n.tone} dot>
                            {n.myConfirmed ? "확인 완료" : n.isMandatory ? "확인 필요" : "공지"}
                          </Tag>
                        </div>
                      ))
                    )}
                  </div>

                  <div
                    className="card__head"
                    style={{ borderTop: "1px solid var(--border-soft)", borderBottom: "none" }}
                  >
                    <div>
                      <div className="card__title">최근 활동</div>
                      <div className="card__sub">내가 담당하는 항목</div>
                    </div>
                  </div>
                  <div className={styles.cardBodyTight}>
                    {activities.length === 0 ? (
                      <div className={styles.emptyRow}>표시할 활동이 없습니다.</div>
                    ) : (
                      activities.map((act) => (
                        <div key={act.id} className={styles.activity}>
                          <Avatar initials={act.initials} tone={act.tone ?? "default"} size="sm" />
                          <div className="flex-1">
                            <div className={styles.activityBody}>
                              <b>{act.author}</b>
                              {act.body}
                            </div>
                            <div className={styles.activityTime}>
                              {act.context} · {act.time}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
