import { notFound } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { projectService } from "@/services/project.service";
import { decisionService } from "@/services/decision.service";
import { authService } from "@/services/auth.service";
import { getServerToken } from "@/lib/server-auth";
import { DecisionsWorkspace } from "./DecisionsWorkspace";

interface Props {
  params: { id: string };
}

// Phase 3 F-2 — project decisions page. Server component reads the list +
// current user role; client component (DecisionsWorkspace) handles create
// / edit / delete / confirm + socket subscription.
export default async function ProjectDecisionsPage({ params }: Props) {
  const token = getServerToken();
  const project = await projectService.getProject(params.id, { token });
  if (!project) notFound();

  const [decisions, me] = await Promise.all([
    decisionService.listByProject(params.id, { token }),
    authService.getMe(token)
  ]);

  const isWriter = ["admin", "super_admin", "manager", "project_owner"].includes(me.role);
  const isAdmin = me.role === "admin" || me.role === "super_admin";

  return (
    <>
      <Topbar title="결정 기록" sub={`${project.code} ${project.name}`} />
      <ProjectHeader project={project} variant="detail" activeTab="decisions" />
      <div className="content">
        <DecisionsWorkspace
          projectId={project.id}
          decisions={decisions}
          currentUserId={me.id}
          isWriter={isWriter}
          isAdmin={isAdmin}
        />
        {decisions.length === 0 ? null : (
          <p className="muted t-xs" style={{ marginTop: 20 }}>
            {decisions.length}건 표시 ·{" "}
            <Link href={`/chat/r-${project.id}`} className="link">
              해당 프로젝트 대화방에서 메시지를 결정사항으로 만들 수 있습니다
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
