"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { FileEntry, User } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { UploadIcon } from "@/components/ui/icons";
import { fileService } from "@/services/file.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { confirmDialog } from "@/components/ui/AppDialogHost";
import styles from "./files.module.css";

const fileColorClass: Record<string, string> = {
  pdf: styles.icPdf,
  xls: styles.icXls,
  doc: styles.icDoc,
  ppt: styles.icPpt,
  img: styles.icImg,
  zip: styles.icZip
};

const fileLabel: Record<string, string> = {
  pdf: "PDF",
  xls: "XLS",
  doc: "DOC",
  ppt: "PPT",
  img: "IMG",
  zip: "ZIP"
};

interface ProjectFilesPanelProps {
  projectId: string;
  initialFiles: FileEntry[];
  users: User[];
}

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

export function ProjectFilesPanel({ projectId, initialFiles, users }: ProjectFilesPanelProps) {
  const router = useRouter();
  const [files, setFiles] = useState<FileEntry[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const userById = new Map(users.map((u) => [u.id, u] as const));

  const pickFile = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const onFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same filename later
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const created = await fileService.uploadFile(file, { projectId });
      setFiles((prev) => [created, ...prev]);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError(describeError(err));
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (file: FileEntry) => {
    if (busyFileId) return;
    if (!(await confirmDialog(`'${file.name}' 파일을 삭제하시겠습니까?`, { danger: true }))) return;
    setBusyFileId(file.id);
    setError(null);
    try {
      await fileService.deleteFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError(describeError(err));
    } finally {
      setBusyFileId(null);
    }
  };

  return (
    <section className={styles.panel}>
      <header className={styles.bar}>
        <div className={styles.barMeta}>{files.length}개 파일</div>
        <div className={styles.barActions}>
          <input
            ref={inputRef}
            type="file"
            className={styles.hiddenInput}
            onChange={onFileSelected}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={pickFile}
            disabled={uploading}
          >
            <UploadIcon size={12} />
            {uploading ? "업로드 중..." : "업로드"}
          </button>
        </div>
      </header>
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
      {files.length === 0 ? (
        <div className={styles.empty}>
          이 프로젝트에 등록된 파일이 없습니다. 우측 상단 `업로드`로 첫 파일을 올려보세요.
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colIc} />
              <th>이름</th>
              <th className={styles.colSz}>크기</th>
              <th className={styles.colBy}>업로드</th>
              <th className={styles.colDt}>날짜</th>
              <th className={styles.colAct} />
            </tr>
          </thead>
          <tbody>
            {files.map((f) => {
              const uploader = userById.get(f.uploaderId);
              const busy = busyFileId === f.id;
              return (
                <tr key={f.id}>
                  <td>
                    <div className={`${styles.fic} ${fileColorClass[f.kind] ?? ""}`}>
                      {fileLabel[f.kind] ?? f.kind.toUpperCase()}
                    </div>
                  </td>
                  <td>
                    <a
                      className={styles.fname}
                      href={fileService.downloadUrl(f.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {f.name}
                    </a>
                  </td>
                  <td className="muted">{f.size}</td>
                  <td>
                    {uploader ? (
                      <div className={styles.byRow}>
                        <Avatar
                          initials={uploader.initials}
                          tone={uploader.avatarTone ?? "default"}
                          size="sm"
                        />
                        <span>
                          {uploader.name} {uploader.position}
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td className="muted">{f.uploadedAt}</td>
                  <td className={styles.rowAct}>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => onDelete(f)}
                      disabled={busy}
                      title="삭제"
                    >
                      {busy ? "..." : "삭제"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
