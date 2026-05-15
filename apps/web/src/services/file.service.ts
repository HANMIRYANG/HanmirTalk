import type { FileEntry, FileFolder } from "@hanmir/shared";
import { apiRequest } from "./api-client";

interface AuthOptions {
  token?: string;
}

export const fileService = {
  async listFolders(opts: AuthOptions = {}): Promise<FileFolder[]> {
    return apiRequest<FileFolder[]>("/files/folders", { token: opts.token });
  },
  async listFiles(opts: AuthOptions = {}): Promise<FileEntry[]> {
    return apiRequest<FileEntry[]>("/files", { token: opts.token });
  }
};
