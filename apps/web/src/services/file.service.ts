import type {
  CreateFolderInput,
  FileEntry,
  FileFolder,
  FolderContents,
  ListFilesFilter,
  RoomFilesPage,
  UpdateFolderInput
} from "@hanmir/shared";
import { ApiError, apiBaseUrl, apiRequest } from "./api-client";

interface AuthOptions {
  token?: string;
}

interface UploadScope {
  projectId?: string;
  productId?: string;
  taskId?: string;
  messageId?: string;
  folderId?: string;
}

export const fileService = {
  async listFolders(opts: AuthOptions = {}): Promise<FileFolder[]> {
    return apiRequest<FileFolder[]>("/files/folders", { token: opts.token });
  },
  async createFolder(
    input: CreateFolderInput,
    opts: AuthOptions = {}
  ): Promise<FileFolder> {
    return apiRequest<FileFolder>("/files/folders", {
      method: "POST",
      body: input,
      token: opts.token
    });
  },
  async updateFolder(
    id: string,
    input: UpdateFolderInput,
    opts: AuthOptions = {}
  ): Promise<FileFolder> {
    return apiRequest<FileFolder>(`/files/folders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },
  async deleteFolder(id: string, opts: AuthOptions = {}): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/files/folders/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token: opts.token
    });
  },
  // 비밀번호 보호 폴더는 password 를 함께 전달 — 서버가 403
  // password_required 를 돌려주면 UI 가 비밀번호 입력을 띄운다.
  async folderContents(
    id: string,
    options: { password?: string } & AuthOptions = {}
  ): Promise<FolderContents> {
    const headers: Record<string, string> = {};
    if (options.password) {
      headers["x-folder-password"] = encodeURIComponent(options.password);
    }
    return apiRequest<FolderContents>(
      `/files/folders/${encodeURIComponent(id)}/contents`,
      { token: options.token, headers }
    );
  },
  async listFiles(opts: AuthOptions & ListFilesFilter = {}): Promise<FileEntry[]> {
    const { token, ...filter } = opts;
    const query: Record<string, string> = {};
    if (filter.projectId) query.projectId = filter.projectId;
    if (filter.productId) query.productId = filter.productId;
    if (filter.taskId) query.taskId = filter.taskId;
    if (filter.messageId) query.messageId = filter.messageId;
    if (filter.uploaderId) query.uploaderId = filter.uploaderId;
    return apiRequest<FileEntry[]>("/files", { token, query });
  },
  async getFile(id: string, opts: AuthOptions = {}): Promise<FileEntry> {
    return apiRequest<FileEntry>(`/files/${encodeURIComponent(id)}`, { token: opts.token });
  },
  // 방에서 메시지로 공유된 첨부 페이지 (최신순, uploaderName 포함).
  // direct(1:1) 방 첨부는 전역 listFiles 에서 제외되므로 방 안에서의
  // 조회는 이 엔드포인트가 유일한 경로다. SSR token 지원.
  async listRoomFiles(
    roomId: string,
    opts: AuthOptions & { limit?: number; offset?: number } = {}
  ): Promise<RoomFilesPage> {
    return apiRequest<RoomFilesPage>(
      `/rooms/${encodeURIComponent(roomId)}/files`,
      { token: opts.token, query: { limit: opts.limit, offset: opts.offset } }
    );
  },
  // Multipart upload bypasses apiRequest because the wrapper forces a
  // JSON Content-Type; FormData must own the multipart boundary itself.
  async uploadFile(
    file: File,
    scope: UploadScope = {},
    opts: AuthOptions = {}
  ): Promise<FileEntry> {
    const form = new FormData();
    form.append("file", file);
    if (scope.projectId) form.append("projectId", scope.projectId);
    if (scope.productId) form.append("productId", scope.productId);
    if (scope.taskId) form.append("taskId", scope.taskId);
    if (scope.messageId) form.append("messageId", scope.messageId);
    if (scope.folderId) form.append("folderId", scope.folderId);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/files/upload`, {
        method: "POST",
        body: form,
        headers,
        credentials: "include"
      });
    } catch (error) {
      throw new ApiError(0, "Network error while uploading file", error);
    }

    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json().catch(() => undefined) : undefined;

    if (!response.ok) {
      const message =
        (payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).error)
          : undefined) ?? `Upload failed (${response.status})`;
      throw new ApiError(response.status, message, payload);
    }
    return payload as FileEntry;
  },
  async deleteFile(id: string, opts: AuthOptions = {}): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/files/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token: opts.token
    });
  },
  downloadUrl(id: string): string {
    return `${apiBaseUrl}/files/${encodeURIComponent(id)}/download`;
  }
};
