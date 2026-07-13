import { Topbar } from "@/components/shell/Topbar";
import { projectService } from "@/services/project.service";
import { requireServerMe } from "@/lib/server-auth";
import { ProjectsBrowser } from "./ProjectsBrowser";

export default async function ProjectListPage() {
  const { token } = await requireServerMe();
  const projects = await projectService.listProjects({ token });

  return (
    <>
      <Topbar title="프로젝트" sub="진행 중인 프로젝트와 책임자, 진행률을 확인하세요." />
      <div className="content">
        <ProjectsBrowser projects={projects} />
      </div>
    </>
  );
}
