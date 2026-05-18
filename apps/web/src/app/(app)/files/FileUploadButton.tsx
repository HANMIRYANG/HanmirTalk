"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { UploadIcon } from "@/components/ui/icons";
import { fileService } from "@/services/file.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 400) {
      if (err.message === "file_required") return "파일을 선택해 주세요.";
      return `업로드에 실패했습니다 (${err.message}).`;
    }
    if (err.status === 413) return "파일이 너무 큽니다.";
  }
  return "업로드에 실패했습니다.";
}

export function FileUploadButton() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const onPicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await fileService.uploadFile(file);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert(describeError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        onChange={onPicked}
      />
      <button
        className="btn btn--primary btn--sm"
        type="button"
        onClick={pick}
        disabled={uploading}
      >
        <UploadIcon size={12} />
        {uploading ? "업로드 중..." : "업로드"}
      </button>
    </>
  );
}
