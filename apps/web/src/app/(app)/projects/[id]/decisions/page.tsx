import { notFound } from "next/navigation";
import Link from "next/link";
import type { Decision } from "@hanmir/shared";
import { Topbar } from "@/components/shell/Topbar";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { projectService } from "@/services/project.service";
import { decisionService } from "@/services/decision.service";
import { ApiError } from "@/services/api-client";
import { requireServerMe } from "@/lib/server-auth";
import { DecisionsWorkspace } from "./DecisionsWorkspace";

interface Props {
  params: { id: string };
}

// Phase 3 F-2 — project decisions page. Server component reads the list +
// current user role; client component (DecisionsWorkspace) handles create
// / edit / delete / confirm + socket subscription.
//
// Access model (Phase 3 F-1): /projects/:id is publicly readable but
// /projects/:id/decisions is project-member-only (admin pass). When a
// non-member lands here (e.g. by clicking the "결정 기록" tab from the
// project overview) we render a clean "권한 없음" state instead of letting
// the 404 bubble to a runtime error. The Project header tab itself is
// also gated in components/project/ProjectHeader.tsx so the link is
// hidden for non-members; this catch is defense in depth.
export default async function ProjectDecisionsPage({ params }: Props) {
  const { me, token } = await requireServerMe();
  const project = await projectService.getProject(params.id, { token });
  if (!project) notFound();

  const isAdmin = me.role === "admin" || me.role === "super_admin";
  const isMember = isAdmin || project.memberIds.includes(me.id);

  let decisions: Decision[] = [];
  let accessDenied = false;
  try {
    decisions = await decisionService.listByProject(params.id, { token });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // The server hides existence (returns 404) when the caller isn't a
      // member; treat as access-denied for UI purposes.
      accessDenied = true;
    } else {
      throw err;
    }
  }

  const isWriter = ["admin", "super_admin", "manager", "project_owner"].includes(me.role);

  return (
    <>
      <Topbar title="결정 기록" sub={`${project.code} ${project.name}`} />
      <ProjectHeader
        project={project}
        variant="detail"
        activeTab="decisions"
        viewer={{ isMember, isAdmin }}
      />
      <div className="content">
        {accessDenied || !isMember ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--text-3)",
              fontSize: 14,
              background: "var(--surface-muted)",
              border: "1px dashed var(--border)",
              borderRadius: 8
            }}
          >
            이 프로젝트의 결정 사항은 프로젝트 멤버만 볼 수 있습니다.
            <br />
            접근이 필요하면 프로젝트 책임자({project.ownerName})에게 멤버 추가를 요청하세요.
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </>
  );
}
