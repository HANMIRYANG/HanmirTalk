"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { aiService, type AiCommand, type AiScope } from "@/services/ai.service";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import styles from "./AiCommandModal.module.css";

interface Props {
  roomId: string;
  command: AiCommand;
  onClose: () => void;
}

const COMMAND_LABEL: Record<AiCommand, string> = {
  "chat-summary": "대화 요약",
  "extract-tasks": "업무 추출",
  "extract-decisions": "결정사항 추출",
  "draft-notice": "공지문 초안",
  minutes: "회의록 정리"
};

const COMMAND_HINT: Record<AiCommand, string> = {
  "chat-summary": "선택한 범위의 대화를 5줄 내로 요약합니다.",
  "extract-tasks": "행동으로 옮겨야 할 업무를 추출합니다 (JSON).",
  "extract-decisions": "공식 결정 사항을 추출합니다 (JSON).",
  "draft-notice": "사내 공지문 초안을 작성합니다.",
  minutes: "회의록 형식으로 정리합니다."
};

const SCOPE_LABEL: Record<AiScope, string> = {
  recent20: "최근 20개 메시지",
  today: "오늘 작성된 메시지",
  thread: "현재 스레드 (추후 — 지금은 recent20 동일)",
  messageIds: "선택한 메시지 (현재 미지원)"
};

// Phase 5 H-5 — AI command preview modal. Flow:
//   1. User picks scope (default recent20)
//   2. Click [생성] → calls /ai/<command> → text result
//   3. User can edit the textarea
//   4. [복사] copies to clipboard | [채팅에 삽입] sends as a new message
//      (aiGenerated=true, aiCommand=<command>, sourceMessageIds=…)
//   5. Auto-send은 절대 안 함 — 확정 클릭 필수
export function AiCommandModal({ roomId, command, onClose }: Props) {
  const router = useRouter();
  const [scope, setScope] = useState<AiScope>("recent20");
  const [result, setResult] = useState<string>("");
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy && !generating) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy, generating]);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const fn = commandToFn(command);
      const res = await fn({ roomId, scope });
      setResult(res.text);
      setSourceIds(res.sourceMessageIds);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 503) {
        setError("관리자에게 ANTHROPIC_API_KEY 설정을 요청하세요.");
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        setError("AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      if (err instanceof ApiError && err.status === 400 && err.message === "no_messages_in_scope") {
        setError("선택한 범위에 메시지가 없습니다.");
        return;
      }
      setError("AI 처리에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(result);
    } catch {
      // older browsers
      const ta = document.createElement("textarea");
      ta.value = result;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const sendAsMessage = async () => {
    if (!result.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Phase 5 H-5 — AI 메타 영속화. 서버가 source_message_ids 를 UUID[]
      // 컬럼에 INSERT 하므로 PG mode 에서는 sourceIds 가 UUID 가 아닌
      // 경우 (예: 메모리 어댑터의 m-<hex>) 라우트 sanitize 가 silent drop
      // 한다. aiGenerated/aiCommand 만이라도 통과되어 "AI 초안" 뱃지가
      // 표시되도록 두 값은 항상 전달.
      await chatService.sendMessage(roomId, result.trim(), {
        aiGenerated: true,
        aiCommand: command,
        sourceMessageIds: sourceIds
      });
      onClose();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError("메시지 전송에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.head}>
          <div className={styles.aiBadge}>AI</div>
          <div>
            <h2 className={styles.title}>{COMMAND_LABEL[command]}</h2>
            <p className={styles.hint}>{COMMAND_HINT[command]}</p>
          </div>
        </div>

        <label className={styles.label}>
          범위
          <select
            className={styles.select}
            value={scope}
            onChange={(e) => setScope(e.target.value as AiScope)}
            disabled={generating || busy}
          >
            <option value="recent20">{SCOPE_LABEL.recent20}</option>
            <option value="today">{SCOPE_LABEL.today}</option>
          </select>
        </label>

        <button
          type="button"
          className={cn("btn btn--primary btn--sm", styles.generateBtn)}
          onClick={generate}
          disabled={generating || busy}
        >
          {generating ? "생성 중…" : result ? "다시 생성" : "생성"}
        </button>

        {result ? (
          <>
            <label className={styles.label}>
              결과 (편집 가능)
              <textarea
                className={styles.textarea}
                value={result}
                onChange={(e) => setResult(e.target.value)}
                rows={12}
                disabled={busy}
              />
            </label>
            <p className={styles.meta}>
              {sourceIds.length}개 메시지에서 생성됨. 채팅에 삽입하면 AI 초안임이 표시됩니다.
            </p>
          </>
        ) : (
          <div className={styles.placeholder}>
            범위를 선택하고 [생성]을 눌러주세요.
          </div>
        )}

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            disabled={busy || generating}
          >
            취소
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={copyToClipboard}
            disabled={!result || busy || generating}
          >
            복사
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={sendAsMessage}
            disabled={!result.trim() || busy || generating}
          >
            {busy ? "전송 중…" : "채팅에 삽입"}
          </button>
        </div>
      </div>
    </div>
  );
}

function commandToFn(command: AiCommand) {
  switch (command) {
    case "chat-summary":
      return aiService.summarize;
    case "extract-tasks":
      return aiService.extractTasks;
    case "extract-decisions":
      return aiService.extractDecisions;
    case "draft-notice":
      return aiService.draftNotice;
    case "minutes":
      return aiService.minutes;
  }
}
