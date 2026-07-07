import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { projectService } from "@/services/project.service";
import { productService } from "@/services/product.service";
import { chatService } from "@/services/chat.service";
import { requireServerMe } from "@/lib/server-auth";
import { ProjectSettingsWorkspace } from "./ProjectSettingsWorkspace";

interface Props {
  params: { id: string };
}

const WRITER_ROLES = new Set(["admin", "super_admin", "manager", "project_owner"]);

// 프로젝트 설정 허브 — 흩어져 있던 관리 기능(기본 정보 수정·관련 제품
// 연결·채팅방 연동·프로젝트 취소)을 한곳에 모은다. 멤버는 열람 가능,
// 편집 액션은 관리 권한(writer 역할 + 멤버십, admin 통과)만.
export default async function ProjectSettingsPage({ params }: Props) {
  const { me, token } = await requireServerMe();
  const project = await projectService.getProject(params.id, { token });
  if (!project) notFound();

  const [products, rooms] = await Promise.all([
    productService.listProducts({ token }),
    chatService.listRooms({ token })
  ]);

  const isAdmin = me.role === "admin" || me.role === "super_admin";
  const isMember = isAdmin || project.memberIds.includes(me.id);
  const canManage = WRITER_ROLES.has(me.role) && isMember;
  const linkedRoom = rooms.find((r) => r.projectId === project.id);

  return (
    <>
      <Topbar title="프로젝트 설정" sub={`${project.code} ${project.name}`} />
      <ProjectHeader
        project={project}
        variant="detail"
        activeTab="settings"
        viewer={{ isMember, isAdmin }}
      />
      <div className="content">
        <ProjectSettingsWorkspace
          project={project}
          products={products}
          linkedRoom={linkedRoom ? { id: linkedRoom.id, name: linkedRoom.name } : null}
          canManage={canManage}
        />
      </div>
    </>
  );
}
