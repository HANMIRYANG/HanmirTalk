import { notFound } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { projectService } from "@/services/project.service";
import { userService } from "@/services/user.service";
import { dashboardService } from "@/services/dashboard.service";
import { chatService } from "@/services/chat.service";
import { requireServerMe } from "@/lib/server-auth";
import { cn } from "@/lib/classNames";
import { ProjectActions } from "./ProjectActions";
import { ProjectMembersCard } from "./ProjectMembersCard";
import { MilestonesCard } from "./MilestonesCard";
import { RecentActivityCard } from "./RecentActivityCard";
import styles from "./detail.module.css";

interface Props {
  params: { id: string };
}

const WRITER_ROLES = new Set(["admin", "super_admin", "manager", "project_owner"]);

export default async function ProjectDetailPage({ params }: Props) {
  const { me, token } = await requireServerMe();
  const project = await projectService.getProject(params.id, { token });
  if (!project) notFound();

  const [users, activities, rooms] = await Promise.all([
    userService.listUsers({ token }),
    dashboardService.listProjectActivities({ token }),
    chatService.listRooms({ token })
  ]);

  const isAdmin = me.role === "admin" || me.role === "super_admin";
  const isMember = isAdmin || project.memberIds.includes(me.id);
  // 서버는 writers 역할 + 프로젝트 멤버십을 모두 요구한다 (마일스톤 CRUD).
  const canManageMilestones = WRITER_ROLES.has(me.role) && isMember;
  // 프로젝트 연동 채팅방 — GET /rooms 는 내가 멤버인 방(admin 은 전체)만
  // 반환하므로, 여기서 찾히면 곧 "열 수 있는 방"이다. 없으면 버튼 숨김.
  const linkedRoom = rooms.find((r) => r.projectId === project.id);

  return (
    <>
      <Topbar title="프로젝트" sub={`${project.code} ${project.name}`} />
      <ProjectHeader
        project={project}
        variant="detail"
        activeTab="overview"
        viewer={{ isMember, isAdmin }}
        rightActions={
          <>
            {linkedRoom ? (
              <Link
                href={`/chat/${linkedRoom.id}`}
                className="btn btn--ghost btn--sm"
                title={`연동 채팅방: ${linkedRoom.name}`}
              >
                💬 채팅방 열기
              </Link>
            ) : null}
            <ProjectActions project={project} />
          </>
        }
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
                <div className="t-xs muted" style={{ marginTop: 6 }}>
                  {project.progressManual
                    ? "직접 지정 값"
                    : `업무 완료 기준 자동 (${project.taskCounts.done}/${project.taskCounts.total})`}
                </div>
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
                  마감일 경과 업무 기준
                </div>
              </div>
              <div className="stat">
                <div className="stat__label">마감까지</div>
                <div className="stat__value">{project.dueDate ? "확인" : "-"}</div>
                <div className="t-xs muted" style={{ marginTop: 10 }}>
                  {project.dueDate ? `${project.dueDate} 종료 예정` : "마감일 미정"}
                </div>
              </div>
            </div>

            <section className={cn("card", styles.section)}>
              <div className="card__head">
                <h3>프로젝트 개요</h3>
                <span className="muted">프로젝트 기본 정보</span>
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

            <MilestonesCard
              projectId={project.id}
              milestones={project.milestones}
              canManage={canManageMilestones}
            />
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
                      <dd>{project.relatedProductIds.length}개 제품 연결</dd>
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

            <RecentActivityCard activities={activities} />
          </aside>
        </div>
      </div>
    </>
  );
}
