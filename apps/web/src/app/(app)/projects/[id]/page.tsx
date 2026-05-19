import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { IconButton } from "@/components/ui/IconButton";
import { projectService } from "@/services/project.service";
import { userService } from "@/services/user.service";
import { dashboardService } from "@/services/dashboard.service";
import { requireServerMe } from "@/lib/server-auth";
import { cn } from "@/lib/classNames";
import { ProjectActions } from "./ProjectActions";
import { ProjectMembersCard } from "./ProjectMembersCard";
import styles from "./detail.module.css";

interface Props {
  params: { id: string };
}

const milestoneTone: Record<string, "default" | "amber" | "green" | "red"> = {
  done: "green",
  in_progress: "amber",
  delayed: "amber",
  pending: "default"
};

const milestoneLabel: Record<string, string> = {
  done: "완료",
  in_progress: "진행중",
  delayed: "진행중",
  pending: "대기"
};

export default async function ProjectDetailPage({ params }: Props) {
  const { token } = await requireServerMe();
  const project = await projectService.getProject(params.id, { token });
  if (!project) notFound();

  const [users, activities] = await Promise.all([
    userService.listUsers({ token }),
    dashboardService.listProjectActivities({ token })
  ]);

  return (
    <>
      <Topbar title="프로젝트" sub={`${project.code} ${project.name}`} />
      <ProjectHeader
        project={project}
        variant="detail"
        activeTab="overview"
        rightActions={<ProjectActions project={project} />}
      />

      <div className="content no-pad">
        <div className={styles.body}>
          <div>
            <div className={styles.statGrid}>
              <div className="stat">
                <div className="stat__label">진행률</div>
                <div className="stat__value">
                  {project.progress}%<small>/ 100</small>
                </div>
                <ProgressBar value={project.progress} className={styles.statProgress} />
              </div>
              <div className="stat">
                <div className="stat__label">업무</div>
                <div className="stat__value">
                  {project.taskCounts.done}
                  <small>/ {project.taskCounts.total} 완료</small>
                </div>
                <div className="t-xs muted" style={{ marginTop: 10 }}>
                  진행 {project.taskCounts.inProgress} · 대기 {project.taskCounts.pending}
                </div>
              </div>
              <div className="stat">
                <div className="stat__label">지연 업무</div>
                <div className="stat__value" style={{ color: "var(--brand-orange)" }}>
                  {project.delayedCount}
                </div>
                <div className="t-xs muted" style={{ marginTop: 10 }}>
                  시험성적서 v0.3 등
                </div>
              </div>
              <div className="stat">
                <div className="stat__label">마감까지</div>
                <div className="stat__value">D-109</div>
                <div className="t-xs muted" style={{ marginTop: 10 }}>
                  {project.dueDate} 종료 예정
                </div>
              </div>
            </div>

            <section className={cn("card", styles.section)}>
              <div className="card__head">
                <h3>프로젝트 개요</h3>
                <span className="muted">최근 수정: 박지영 · 5월 11일</span>
                <div className="right">
                  <IconButton aria-label="편집">
                    <span style={{ fontSize: 14 }}>✎</span>
                  </IconButton>
                </div>
              </div>
              <div className={cn("card__body", styles.desc)}>
                <p>{project.description}</p>

                <h4>주요 목표</h4>
                <ul>
                  {project.goals.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>

                <h4>주요 산출물</h4>
                <ul>
                  {project.outputs.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className={cn("card", styles.section)}>
              <div className="card__head">
                <h3>주요 일정</h3>
                <span className="muted">
                  {project.milestones.length}개 마일스톤 ·{" "}
                  {project.milestones.filter((m) => m.status === "done").length}개 완료
                </span>
                <div className="right">
                  <Link href={`/projects/${project.id}/gantt`} className="btn btn--ghost btn--sm">
                    간트 보기 →
                  </Link>
                </div>
              </div>
              <div className={styles.milestoneList}>
                {project.milestones.map((m) => (
                  <div key={m.id} className={styles.milestone}>
                    <div
                      className={cn(
                        styles.dot,
                        m.status === "done" && styles.dotDone,
                        (m.status === "in_progress" || m.status === "delayed") &&
                          styles.dotCurrent,
                        m.status === "pending" && styles.dotFuture
                      )}
                    />
                    <div>
                      <div className={styles.mTitle}>{m.title}</div>
                      <div className={styles.mSub}>{m.subtitle}</div>
                    </div>
                    <Tag tone={milestoneTone[m.status]}>{milestoneLabel[m.status]}</Tag>
                    <div className={styles.mDate}>{m.date}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className={styles.side}>
            <section className="card">
              <div className="card__head">
                <h3>프로젝트 정보</h3>
              </div>
              <div className="card__body">
                <dl className={styles.metaList}>
                  <dt>프로젝트 코드</dt>
                  <dd>{project.code}</dd>
                  {project.type ? (
                    <>
                      <dt>유형</dt>
                      <dd>{project.type}</dd>
                    </>
                  ) : null}
                  <dt>주관 부서</dt>
                  <dd>{project.department}</dd>
                  {project.budget ? (
                    <>
                      <dt>예산</dt>
                      <dd>{project.budget}</dd>
                    </>
                  ) : null}
                  {project.relatedProductIds && project.relatedProductIds.length > 0 ? (
                    <>
                      <dt>관련 제품</dt>
                      <dd>SUS304 강판, SUS316 강판</dd>
                    </>
                  ) : null}
                  {project.externalPartners ? (
                    <>
                      <dt>외부 협력사</dt>
                      <dd>{project.externalPartners}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </section>

            <ProjectMembersCard project={project} users={users} />

            <section className="card">
              <div className="card__head">
                <h3>최근 활동</h3>
              </div>
              <div className={styles.activityBody}>
                {activities.map((a) => (
                  <div key={a.id} className={styles.activityRow}>
                    <Avatar initials={a.initials} tone={a.tone ?? "default"} size="sm" />
                    <div>
                      <div className={styles.activityText}>
                        <b>{a.author}</b>
                        {a.body}
                      </div>
                      <div className={styles.activityTime}>{a.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
