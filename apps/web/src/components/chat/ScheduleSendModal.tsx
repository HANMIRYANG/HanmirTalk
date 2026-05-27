"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { FileEntry, MessageEntity } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "./ScheduleSendModal.module.css";

// Phase 10 M-4 — 예약 전송 모달.
//
// 입력:
//   - roomId / 작성 중인 본문 / 첨부 / entities
//   - 사용자가 datetime-local 로 시각을 선택
//
// 흐름:
//   1. 시각 검증 (값 비어있지 않음 + 미래)
//   2. chatService.scheduleMessage 호출
//   3. 성공 시 onScheduled() 콜백으로 composer 입력 초기화 + 모달 닫기
//
// datetime-local 의 value 는 사용자 로컬 시각의 "YYYY-MM-DDTHH:MM" 형식
// (timezone 정보 없음) — new Date(value) 는 이를 로컬 시간대로 해석하므로
// toISOString() 으로 변환해 서버로 보낸다. 서버가 UTC 로 비교.

interface ScheduleSendModalProps {
  open: boolean;
  onClose: () => void;
  roomId: string;
  body: string;
  entities: MessageEntity[];
  attachment?: FileEntry | null;
  onScheduled: () => void;
}

// "YYYY-MM-DDTHH:MM" 로컬 포맷 (datetime-local 의 min 속성과 호환).
function localDatetimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) {
      if (err.message === "scheduledAt_in_past") return "예약 시각은 현재 이후여야 합니다.";
      if (err.message === "scheduledAt_invalid") return "예약 시각 형식이 올바르지 않습니다.";
      if (err.message === "empty_message") return "본문이나 첨부 중 하나는 있어야 합니다.";
      return "입력값이 올바르지 않습니다.";
    }
    if (err.status === 403) return "예약 권한이 없습니다.";
    if (err.status === 404) return "채팅방을 찾을 수 없습니다.";
  }
  return "예약 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function ScheduleSendModal({
  open,
  onClose,
  roomId,
  body,
  entities,
  attachment,
  onScheduled
}: ScheduleSendModalProps) {
  const router = useRouter();
  const [value, setValue] = useState<string>("");
  const [minValue, setMinValue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달이 열릴 때마다 기본값(현재 + 10분) 과 min(현재) 을 새로 계산.
  // 이전에 열고 닫은 stale 값이 남아 있지 않도록.
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    now.setSeconds(0, 0);
    const def = new Date(now.getTime() + 10 * 60_000);
    setValue(localDatetimeString(def));
    setMinValue(localDatetimeString(now));
    setError(null);
  }, [open]);

  const trimmedBody = body.trim();
  const canSchedule = !!trimmedBody || !!attachment;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!value) {
      setError("예약 시각을 선택해 주세요.");
      return;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      setError("예약 시각 형식이 올바르지 않습니다.");
      return;
    }
    if (parsed.getTime() < Date.now() - 1_000) {
      setError("예약 시각은 현재 이후여야 합니다.");
      return;
    }
    if (!canSchedule) {
      setError("본문이나 첨부 중 하나는 있어야 합니다.");
      return;
    }

    setSubmitting(true);
    try {
      await chatService.scheduleMessage({
        roomId,
        content: body,
        scheduledAt: parsed.toISOString(),
        entities: entities.length > 0 ? entities : undefined,
        attachmentId: attachment?.id
      });
      onScheduled();
      onClose();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (submitting) return;
        onClose();
      }}
      title="예약 전송"
      description="선택한 시각에 본 메시지가 자동으로 전송됩니다."
      width={480}
      footer={
        <>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={onClose}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="submit"
            form="schedule-send-form"
            className="btn btn--primary btn--sm"
            disabled={submitting || !canSchedule}
          >
            {submitting ? "예약 중..." : "예약하기"}
          </button>
        </>
      }
    >
      <form id="schedule-send-form" onSubmit={onSubmit} noValidate>
        <label className={styles.label}>
          전송 시각
          <input
            className="field"
            type="datetime-local"
            value={value}
            min={minValue}
            onChange={(e) => setValue(e.target.value)}
            required
            autoFocus
            disabled={submitting}
          />
          <span className={styles.hint}>
            현재 이후의 시각을 선택해 주세요. 서버 시간대 기준으로 전송됩니다.
          </span>
        </label>
        <div className={styles.preview}>
          <div className={styles.previewLabel}>본문 미리보기</div>
          <div className={styles.previewBody}>
            {trimmedBody ? trimmedBody : <em>본문 없음 (첨부만 전송)</em>}
          </div>
          {attachment ? (
            <div className={styles.previewAttach}>📎 {attachment.name}</div>
          ) : null}
        </div>
        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
