import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { projectService } from "@/services/project.service";
import { taskService } from "@/services/task.service";
import { userService } from "@/services/user.service";
import { requireServerMe } from "@/lib/server-auth";
import { TaskCreateButton } from "./TaskCreateButton";
import { TasksWorkspace } from "./TasksWorkspace";

interface Props {
  params: { id: string };
}

export default async function ProjectTasksPage({ params }: Props) {
  const { me, token } = await requireServerMe();
  const project = await projectService.getProject(params.id, { token });
  if (!project) notFound();

  const [tasks, users] = await Promise.all([
    taskService.listByProject(params.id, { token }),
    userService.listUsers({ token })
  ]);

  const isAdmin = me.role === "admin" || me.role === "super_admin";
  const isMember = isAdmin || project.memberIds.includes(me.id);

  return (
    <>
      <Topbar title="프로젝트" sub={`${project.code} ${project.name}`} />
      <ProjectHeader
        project={project}
        activeTab="tasks"
        viewer={{ isMember, isAdmin }}
        rightActions={<TaskCreateButton projectId={params.id} users={users} />}
      />
      <TasksWorkspace
        projectId={params.id}
        doneCount={project.taskCounts.done}
        tasks={tasks}
        users={users}
        meId={me.id}
      />
    </>
  );
}
