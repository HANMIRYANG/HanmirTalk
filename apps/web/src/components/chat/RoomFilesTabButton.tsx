"use client";

// 프로젝트 미연동 방(1:1 포함)의 "파일" 탭 — 방에서 메시지로 공유된
// 첨부파일 목록 모달을 연다 (프로젝트방은 기존 프로젝트 파일 페이지
// 링크 유지). direct 방 첨부는 자료실 전체 목록에서 제외되므로 이
// 모달이 방 파일을 모아 보는 유일한 화면이다.
import { useCallback, useEffect, useState } from "react";
import type { RoomFilesPage } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { fileService } from "@/services/file.service";
import styles from "./RoomFilesTabButton.module.css";

const PAGE_SIZE = 10;

const fileTag: Record<string, string> = {
  pdf: "PDF",
  xls: "XLS",
  doc: "DOC",
  ppt: "PPT",
  img: "IMG",
  zip: "ZIP"
};

interface RoomFilesTabButtonProps {
  roomId: string;
  className?: string;
}

export function RoomFilesTabButton({ roomId, className }: RoomFilesTabButtonProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RoomFilesPage | null>(null);

  const fetchPage = useCallback(
    async (p: number) => {
      try {
        const result = await fileService.listRoomFiles(roomId, {
          limit: PAGE_SIZE,
          offset: (p - 1) * PAGE_SIZE
        });
        setData(result);
      } catch {
        setData({ rows: [], total: 0 });
      }
    },
    [roomId]
  );

  useEffect(() => {
    if (!open) return;
    void fetchPage(page);
  }, [open, page, fetchPage]);

  useEffect(() => {
    if (!open) {
      setPage(1);
      setData(null);
    }
  }, [open]);

  const pageCount = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        파일
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="방 공유 파일"
        description="이 방에서 메시지로 공유된 파일입니다. 파일명을 클릭하면 다운로드됩니다."
        width={620}
      >
        {!data ? (
          <p className={styles.empty}>불러오는 중…</p>
        ) : data.total === 0 ? (
          <p className={styles.empty}>공유된 파일이 없습니다.</p>
        ) : (
          <>
            <ul className={styles.list}>
              {data.rows.map((f) => (
                <li key={f.id} className={styles.row}>
                  <span className={styles.kind}>{fileTag[f.kind] ?? "FILE"}</span>
                  <a
                    href={fileService.downloadUrl(f.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.name}
                    title="다운로드"
                  >
                    {f.name}
                  </a>
                  <span className={styles.meta}>
                    {f.uploaderName ?? "—"} · {f.uploadedAt}
                    {f.size ? ` · ${f.size}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} />
          </>
        )}
      </Modal>
    </>
  );
}
