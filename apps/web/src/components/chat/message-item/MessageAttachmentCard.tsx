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
export function MessageAttachmentCard({ attachment }: { attachment: MessageAttachment }) {
  return (
    <div className={styles.file}>
      <div className={cn(styles.fileIc, fileColor[attachment.kind])}>
        {fileLabel[attachment.kind]}
      </div>
      <div>
        <div className={styles.fileName}>{attachment.name}</div>
        <div className={styles.fileMeta}>{attachment.meta}</div>
      </div>
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
