"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { decisionService } from "@/services/decision.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "../MessageItem.module.css";

// Phase 3 F-2c — modal launched from MessageItem's hover menu. Pre-fills
// the title (first line of the message, truncated) and content (full
// body) so the user only has to confirm or tweak. On success we navigate
// to the project's decisions page so they see the new entry in context.
export function CreateDecisionFromMessageModal({
  messageId,
  messageBody,
  projectId,
  onClose
}: {
  messageId: string;
  messageBody: string;
  projectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const firstLine = messageBody.split("\n")[0]?.slice(0, 80) ?? "";
  const [title, setTitle] = useState(firstLine);
  const [content, setContent] = useState(messageBody);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    if (!title.trim() || !content.trim()) {
      setError("제목과 내용을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      await decisionService.createFromMessage(messageId, {
        title: title.trim(),
        content: content.trim(),
        decisionDate: date
      });
      onClose();
      router.push(`/projects/${projectId}/decisions`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 400) {
        setError("이 메시지를 결정사항으로 만들 수 없습니다 (소스가 프로젝트 방이 아닐 수 있습니다).");
        return;
      }
      setError("저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <form
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h2 className={styles.modalTitle}>이 메시지를 결정사항으로 기록</h2>
        <p className={styles.modalHint}>
          저장 후 프로젝트 결정 기록 페이지에서 확인 추적이 시작됩니다.
        </p>
        <label className={styles.modalLabel}>
          제목
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            autoFocus
            required
          />
        </label>
        <label className={styles.modalLabel}>
          내용
          <textarea
            className={styles.modalTextarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            disabled={busy}
            required
          />
        </label>
        <label className={styles.modalLabel}>
          결정일
          <input
            className="field"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
            required
          />
        </label>
        {error ? <div className={styles.modalError}>{error}</div> : null}
        <div className={styles.modalBtns}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            disabled={busy}
          >
            취소
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            {busy ? "저장 중…" : "결정사항으로 저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
