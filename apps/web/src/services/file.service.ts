import type { FileEntry, FileFolder, ListFilesFilter } from "@hanmir/shared";
import { ApiError, apiBaseUrl, apiRequest } from "./api-client";

interface AuthOptions {
  token?: string;
}

interface UploadScope {
  projectId?: string;
  productId?: string;
  taskId?: string;
  messageId?: string;
}

export const fileService = {
  async listFolders(opts: AuthOptions = {}): Promise<FileFolder[]> {
    return apiRequest<FileFolder[]>("/files/folders", { token: opts.token });
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
