"use client";

import { Modal } from "@/components/ui/Modal";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { BatchResult } from "./upload-batch";
import styles from "./files.module.css";

export interface UploadQueueState {
  phase: "uploading" | "done";
  // 지금 시도 중인 파일의 1-base 순번 (0 = 폴더 준비 단계)
  current: number;
  total: number;
  name: string;
  result?: BatchResult;
}

interface UploadQueueModalProps {
  state: UploadQueueState | null;
  cancelRequested: boolean;
  onCancel: () => void;
  onClose: () => void;
}

export function UploadQueueModal({
  state,
  cancelRequested,
  onCancel,
  onClose
}: UploadQueueModalProps) {
  if (!state) return null;
  const uploading = state.phase === "uploading";
  const result = state.result;
  const doneCount = Math.max(state.current - 1, 0);
  const pct = state.total > 0 ? Math.round((doneCount / state.total) * 100) : 0;

  return (
    <Modal
      open
      onClose={uploading ? () => undefined : onClose}
      title="파일 업로드"
      description={
        uploading ? "업로드가 끝날 때까지 이 창을 닫을 수 없습니다." : undefined
      }
      width={440}
    >
      {uploading ? (
        <>
          <div className={styles.uploadSummary}>
            {state.current === 0
              ? "업로드 준비 중..."
              : `업로드 중 ${state.current}/${state.total}`}
          </div>
          {state.name ? <div className={styles.uploadName}>{state.name}</div> : null}
          <ProgressBar value={pct} className={styles.uploadBar} />
          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}
          >
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={onCancel}
              disabled={cancelRequested}
            >
              {cancelRequested ? "중단 중..." : "중단"}
            </button>
          </div>
        </>
      ) : result ? (
        <>
          <div className={styles.uploadSummary}>
            {result.ok}개 성공
            {result.failures.length > 0 ? `, ${result.failures.length}개 실패` : ""}
            {result.skipped > 0 ? `, ${result.skipped}개 중단됨` : ""}
          </div>
          {result.failures.length > 0 ? (
            <div className={styles.uploadFailList}>
              {result.failures.map((f, i) => (
                <div key={`${f.name}-${i}`} className={styles.uploadFailRow}>
                  <span className={styles.uploadFailName}>{f.name}</span>
                  <span className={styles.uploadFailReason}>{f.reason}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}
          >
            <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
              닫기
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
