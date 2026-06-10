"use client";

import type { KeyboardEvent } from "react";
import styles from "../MessageItem.module.css";

interface MessageEditFormProps {
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  error: string | null;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}

// Phase 2 E-1 — 인라인 수정 모드 UI. 상태/핸들러는 useMessageActions 가
// 소유하고 이 컴포넌트는 마크업만 담당한다.
export function MessageEditForm({
  draft,
  setDraft,
  busy,
  error,
  onKeyDown,
  onCancel,
  onSave
}: MessageEditFormProps) {
  return (
    <div className={styles.editor}>
      <textarea
        className={styles.editTextarea}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        rows={Math.min(8, Math.max(2, draft.split("\n").length))}
        disabled={busy}
        autoFocus
      />
      <div className={styles.editFoot}>
        <span className={styles.editHint}>Ctrl+Enter 저장 · Esc 취소</span>
        <div className={styles.editBtns}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onCancel}
            disabled={busy}
          >
            취소
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void onSave()}
            disabled={busy}
          >
            저장
          </button>
        </div>
      </div>
      {error ? <div className={styles.editError}>{error}</div> : null}
    </div>
  );
}
