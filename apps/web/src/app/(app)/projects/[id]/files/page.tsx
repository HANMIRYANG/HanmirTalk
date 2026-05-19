import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { projectService } from "@/services/project.service";
import { fileService } from "@/services/file.service";
import { userService } from "@/services/user.service";
import { requireServerMe } from "@/lib/server-auth";
import { ProjectFilesPanel } from "./ProjectFilesPanel";
import styles from "./files.module.css";

interface Props {
  params: { id: string };
}

export default async function ProjectFilesPage({ params }: Props) {
  const { token } = await requireServerMe();
  const project = await projectService.getProject(params.id, { token });
  if (!project) notFound();

  const [files, users] = await Promise.all([
    fileService.listFiles({ token, projectId: params.id }),
    userService.listUsers({ token })
  ]);

  return (
    <>
      <Topbar title="프로젝트" sub={`${project.code} ${project.name}`} />
      <ProjectHeader project={project} variant="detail" activeTab="files" />
      <div className="content no-pad">
        <div className={styles.wrap}>
          <ProjectFilesPanel projectId={params.id} initialFiles={files} users={users} />
        </div>
      </div>
    </>
  );
}
