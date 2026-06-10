import { Topbar } from "@/components/shell/Topbar";
import { projectService } from "@/services/project.service";
import { requireServerMe } from "@/lib/server-auth";
import { ProjectCreateButton } from "./ProjectCreateButton";
import { ProjectsPagedGrid } from "./ProjectsPagedGrid";
import styles from "./projects.module.css";

export default async function ProjectListPage() {
  const { token } = await requireServerMe();
  const projects = await projectService.listProjects({ token });

  return (
    <>
      <Topbar title="프로젝트" sub="진행 중인 프로젝트와 책임자, 진행률을 확인하세요." />
      <div className="content">
        <div className={styles.toolbar}>
          <div className={styles.toolbarMeta}>{projects.length}개 프로젝트</div>
          <ProjectCreateButton />
        </div>
        <ProjectsPagedGrid projects={projects} />
      </div>
    </>
  );
}
