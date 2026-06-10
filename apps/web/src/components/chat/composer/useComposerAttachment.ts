"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { FileEntry } from "@hanmir/shared";
import { fileService } from "@/services/file.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";

interface UseComposerAttachmentArgs {
  // Used as upload scope so attachments uploaded from a project room land
  // tagged with the project, making them visible on /projects/[id]/files.
  projectId?: string;
  sending: boolean;
  setError: (message: string | null) => void;
}

// 첨부 업로드 상태 묶음 — 숨김 file input ref, 업로드 진행/결과 state,
// 업로드 실패 메시지는 composer 공용 error 로 올린다.
export function useComposerAttachment({
  projectId,
  sending,
  setError
}: UseComposerAttachmentArgs) {
  const router = useRouter();
  const [attachment, setAttachment] = useState<FileEntry | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickAttachment = () => {
    if (uploading || sending) return;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await fileService.uploadFile(file, projectId ? { projectId } : {});
      setAttachment(uploaded);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 413) {
        setError("파일이 너무 큽니다.");
      } else {
        setError("파일 업로드에 실패했습니다.");
      }
    } finally {
      setUploading(false);
    }
  };

  const clearAttachment = () => setAttachment(null);

  return {
    attachment,
    setAttachment,
    uploading,
    fileInputRef,
    pickAttachment,
    onFileSelected,
    clearAttachment
  };
}
