import { Topbar } from "@/components/shell/Topbar";
import { fileService } from "@/services/file.service";
import { userService } from "@/services/user.service";
import { projectService } from "@/services/project.service";
import { requireServerMe } from "@/lib/server-auth";
import { FileLibrary } from "./FileLibrary";

export default async function FileLibraryPage() {
  const { me, token } = await requireServerMe();
  const [folders, files, users, projects] = await Promise.all([
    fileService.listFolders({ token }),
    fileService.listFiles({ token }),
    userService.listUsers({ token }),
    projectService.listProjects({ token })
  ]);

  return (
    <>
      <Topbar title="파일함" sub={`전체 파일 · ${files.length}개`} />
      <FileLibrary
        folders={folders}
        files={files}
        users={users}
        projects={projects}
        meId={me.id}
        meRole={me.role}
      />
    </>
  );
}
