import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { GanttTimeline, type GanttRow } from "@/components/project/GanttTimeline";
import { projectService } from "@/services/project.service";
import { userService } from "@/services/user.service";
import { requireServerMe } from "@/lib/server-auth";
import { TaskCreateButton } from "@/app/(app)/projects/[id]/tasks/TaskCreateButton";
import { GanttToolbar, GanttPdfButton } from "./GanttToolbar";
import styles from "./gantt.module.css";

interface Props {
  params: { id: string };
}

const ROWS: GanttRow[] = [
  { kind: "group", label: "M3. 시험 운영 및 시험성적서", progress: "100%", from: 0, to: 6 },
  {
    kind: "task",
    label: "시험성적서 v0.2 작성",
    taskId: "T-1015",
    assigneeInitials: "박지",
    assigneeTone: "orange",
    progressLabel: "100%",
    from: 0,
    to: 3,
    state: "done"
  },
  {
    kind: "task",
    label: "시험성적서 v0.2 결재",
    taskId: "T-1018",
    assigneeInitials: "이수",
    assigneeTone: "purple",
    progressLabel: "100%",
    from: 3,
    to: 6,
    state: "done"
  },
  { kind: "group", label: "M4. 시험성적서 v1.0 확정", progress: "52%", from: 7, to: 18 },
  {
    kind: "task",
    label: "시험성적서 v0.3 검토 회신",
    taskId: "T-1024",
    assigneeInitials: "박지",
    assigneeTone: "orange",
    progressLabel: "80%",
    progressColor: "var(--danger)",
    from: 7,
    to: 12,
    state: "late",
    progress: 80
  },
  {
    kind: "task",
    label: "비고란 영업상태 반영",
    taskId: "T-1031",
    assigneeInitials: "윤",
    assigneeTone: "green",
    progressLabel: "25%",
    progressColor: "var(--danger)",
    from: 7,
    to: 11,
    state: "late",
    progress: 25
  },
  {
    kind: "task",
    label: "v1.0 결재 상신 및 승인",
    taskId: "T-1033",
    assigneeInitials: "이수",
    assigneeTone: "purple",
    progressLabel: "0%",
    from: 13,
    to: 18,
    state: "pending"
  },
  { kind: "group", label: "병행 업무", progress: "38%", from: 11, to: 27 },
  {
    kind: "task",
    label: "7월 생산일정 초안",
    taskId: "T-1042",
    assigneeInitials: "김민",
    progressLabel: "45%",
    from: 11,
    to: 14,
    state: "progress",
    progress: 45
  },
  {
    kind: "task",
    label: "자동검사기 작동 매뉴얼",
    taskId: "T-1045",
    assigneeInitials: "박지",
    assigneeTone: "orange",
    progressLabel: "60%",
    from: 12,
    to: 17,
    state: "progress",
    progress: 60
  },
  {
    kind: "task",
    label: "SOP 표준양식 v1.0 초안",
    taskId: "T-1052",
    assigneeInitials: "박지",
    assigneeTone: "orange",
    progressLabel: "10%",
    from: 18,
    to: 22,
    state: "progress",
    progress: 10
  },
  {
    kind: "task",
    label: "현장 교육자료 작성",
    taskId: "T-1058",
    assigneeInitials: "미",
    assigneeTone: "gray",
    progressLabel: "0%",
    from: 24,
    to: 27,
    state: "pending"
  },
  { kind: "milestone", label: "M5. 라인 본가동", day: 30 }
];

export default async function ProjectGanttPage({ params }: Props) {
  const { me, token } = await requireServerMe();
  const project = await projectService.getProject(params.id, { token });
  if (!project) notFound();

  const users = await userService.listUsers({ token });

  const isAdmin = me.role === "admin" || me.role === "super_admin";
  const isMember = isAdmin || project.memberIds.includes(me.id);

  return (
    <>
      <Topbar title="프로젝트" sub={`${project.code} ${project.name}`} />
      <ProjectHeader
        project={project}
        activeTab="gantt"
        viewer={{ isMember, isAdmin }}
        rightActions={
          <>
            <GanttPdfButton />
            <TaskCreateButton
              projectId={params.id}
              users={users}
              label="+ 일정 추가"
            />
          </>
        }
      />

      <GanttToolbar />

      <div className="content no-pad">
        <div className={styles.ganttWrap}>
          <GanttTimeline
            startDate={new Date(2026, 4, 1)}
            totalDays={42}
            todayIndex={12}
            rows={ROWS}
          />
        </div>
      </div>
    </>
  );
}
