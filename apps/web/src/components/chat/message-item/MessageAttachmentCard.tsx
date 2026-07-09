"use client";

import type { MessageAttachment } from "@hanmir/shared";
import { DownloadIcon } from "@/components/ui/icons";
import { fileService } from "@/services/file.service";
import { cn } from "@/lib/classNames";
import styles from "../MessageItem.module.css";

const fileColor: Record<string, string> = {
  pdf: styles.icPdf,
  xls: styles.icXls,
  doc: styles.icDoc,
  ppt: styles.icPpt,
  img: styles.icImg,
  zip: styles.icZip
};

const fileLabel: Record<string, string> = {
  pdf: "PDF",
  xls: "XLSX",
  doc: "DOCX",
  ppt: "PPTX",
  img: "IMG",
  zip: "ZIP"
};

// 메시지에 붙은 첨부파일 카드 — 아이콘 + 이름/메타 + 다운로드 버튼.
// 파일명 영역도 다운로드 앵커 — 작은 아이콘만 클릭되는 불편 해소
// (아이콘 앵커와 중첩되지 않게 형제 앵커로 유지).
export function MessageAttachmentCard({ attachment }: { attachment: MessageAttachment }) {
  return (
    <div className={styles.file}>
      <div className={cn(styles.fileIc, fileColor[attachment.kind])}>
        {fileLabel[attachment.kind]}
      </div>
      <a
        href={fileService.downloadUrl(attachment.id)}
        target="_blank"
        rel="noopener noreferrer"
        title="다운로드"
        style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}
      >
        <div className={styles.fileName}>{attachment.name}</div>
        <div className={styles.fileMeta}>{attachment.meta}</div>
      </a>
      <div className={styles.fileActions}>
        <a
          href={fileService.downloadUrl(attachment.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--outline btn--sm"
          aria-label="다운로드"
          title="다운로드"
        >
          <DownloadIcon size={14} />
        </a>
      </div>
    </div>
  );
}
