import { Topbar } from "@/components/shell/Topbar";
import { fileService } from "@/services/file.service";
import { userService } from "@/services/user.service";
import { projectService } from "@/services/project.service";
import { authService } from "@/services/auth.service";
import { getServerToken } from "@/lib/server-auth";
import { FileLibrary } from "./FileLibrary";

export default async function FileLibraryPage() {
  const token = getServerToken();
  const [folders, files, users, projects, me] = await Promise.all([
    fileService.listFolders({ token }),
    fileService.listFiles({ token }),
    userService.listUsers({ token }),
    projectService.listProjects({ token }),
    authService.getMe(token)
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
      />
    </>
  );
}
