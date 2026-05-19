"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Decision } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { decisionService } from "@/services/decision.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/classNames";
import styles from "./decisions.module.css";

interface Props {
  projectId: string;
  decisions: Decision[];
  currentUserId: string;
  isWriter: boolean;
  isAdmin: boolean;
}

export function DecisionsWorkspace({
  projectId,
  decisions,
  currentUserId,
  isWriter,
  isAdmin
}: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Project channel subscription so other users' create/update/delete
  // changes refresh this page automatically.
  useEffect(() => {
    const socket = getSocket();
    socket.emit("project:join", projectId);
    const refresh = () => router.refresh();
    socket.on("decision:new", refresh);
    socket.on("decision:updated", refresh);
    socket.on("decision:deleted", refresh);
    return () => {
      socket.emit("project:leave", projectId);
      socket.off("decision:new", refresh);
      socket.off("decision:updated", refresh);
      socket.off("decision:deleted", refresh);
    };
  }, [projectId, router]);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarMeta}>
          이 프로젝트의 공식 결정 사항을 시간순으로 기록합니다.
        </div>
        {isWriter ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setCreating(true)}
          >
            + 결정 기록
          </button>
        ) : null}
      </div>

      {creating ? (
        <DecisionCreateModal
          projectId={projectId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}

      {decisions.length === 0 ? (
        <div className={styles.empty}>
          아직 등록된 결정 사항이 없습니다.
          {isWriter ? " 우측 상단의 [+ 결정 기록] 버튼으로 첫 항목을 만드세요." : ""}
        </div>
      ) : (
        <ul className={styles.list}>
          {decisions.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              editing={editingId === d.id}
              onStartEdit={() => setEditingId(d.id)}
              onStopEdit={() => setEditingId(null)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function DecisionCard({
  decision,
  currentUserId,
  isAdmin,
  editing,
  onStartEdit,
  onStopEdit
}: {
  decision: Decision;
  currentUserId: string;
  isAdmin: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}) {
  const router = useRouter();
  const isAuthor = decision.decidedById === currentUserId;
  const canEdit = (isAuthor || isAdmin) && !decision.isDeleted;
  const canDelete = (isAuthor || isAdmin) && !decision.isDeleted;
  const canConfirm = !decision.myConfirmed && !decision.isDeleted;

  const onDelete = async () => {
    if (!window.confirm("이 결정 사항을 삭제하시겠습니까? 복구할 수 없습니다.")) return;
    try {
      await decisionService.deleteDecision(decision.id);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert("삭제에 실패했습니다.");
    }
  };

  const onConfirm = async () => {
    try {
      await decisionService.confirmDecision(decision.id);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert("확인 처리에 실패했습니다.");
    }
  };

  return (
    <li className={cn(styles.card, decision.isDeleted && styles.cardDeleted)}>
      {editing ? (
        <DecisionInlineEditor
          decision={decision}
          onCancel={onStopEdit}
          onSaved={() => {
            onStopEdit();
            router.refresh();
          }}
        />
      ) : (
        <>
          <div className={styles.cardHead}>
            <div>
              <div className={styles.cardTitle}>{decision.title}</div>
              <div className={styles.cardMeta}>
                결정일 <b>{decision.decisionDate}</b>
                {" · "}
                {decision.decidedByName}
                {decision.decidedByRole ? ` · ${decision.decidedByRole}` : ""}
              </div>
            </div>
            <div className={styles.cardBadges}>
              {decision.isDeleted ? (
                <Tag tone="default">삭제됨</Tag>
              ) : decision.myConfirmed ? (
                <Tag tone="green" dot>
                  확인 완료
                </Tag>
              ) : (
                <Tag tone="amber" dot>
                  확인 필요
                </Tag>
              )}
              <span className={styles.cardCount}>
                {decision.confirmedCount}/{decision.totalRecipients} 확인
              </span>
            </div>
          </div>

          <div className={styles.cardBody}>{decision.content}</div>

          <div className={styles.cardFoot}>
            {decision.sourceMessageId && decision.sourceRoomId ? (
              <Link
                href={`/chat/${decision.sourceRoomId}#m-${decision.sourceMessageId}`}
                className={styles.sourceLink}
              >
                출처 메시지 보기 →
              </Link>
            ) : (
              <span className={styles.sourceLink} style={{ visibility: "hidden" }}>
                placeholder
              </span>
            )}
            <div className={styles.cardActions}>
              {canConfirm ? (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={onConfirm}
                >
                  확인
                </button>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={onStartEdit}
                >
                  수정
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={onDelete}
                  style={{ color: "var(--danger)" }}
                >
                  삭제
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </li>
  );
}

function DecisionInlineEditor({
  decision,
  onCancel,
  onSaved
}: {
  decision: Decision;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(decision.title);
  const [content, setContent] = useState(decision.content);
  const [date, setDate] = useState(decision.decisionDate.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    if (!title.trim() || !content.trim() || !date.trim()) {
      setError("제목 · 내용 · 결정일을 모두 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      await decisionService.updateDecision(decision.id, {
        title: title.trim(),
        content: content.trim(),
        decisionDate: date
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError("저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void onSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className={styles.editor}>
      <label className={styles.editorLabel}>
        제목
        <input
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          autoFocus
        />
      </label>
      <label className={styles.editorLabel}>
        내용
        <textarea
          className={styles.editorTextarea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          rows={6}
          disabled={busy}
        />
      </label>
      <label className={styles.editorLabel}>
        결정일
        <input
          className="field"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={busy}
        />
      </label>
      {error ? <div className={styles.editorError}>{error}</div> : null}
      <div className={styles.editorBtns}>
        <span className="muted t-xs">Ctrl+Enter 저장 · Esc 취소</span>
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
  );
}

function DecisionCreateModal({
  projectId,
  onClose,
  onCreated
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
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
      await decisionService.createDecision(projectId, {
        title: title.trim(),
        content: content.trim(),
        decisionDate: date
      });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
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
        <h2 className={styles.modalTitle}>결정 사항 기록</h2>
        <label className={styles.editorLabel}>
          제목
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 7월 안전교육 의무 이수 확정"
            disabled={busy}
            autoFocus
            required
          />
        </label>
        <label className={styles.editorLabel}>
          내용
          <textarea
            className={styles.editorTextarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="결정의 배경, 합의 내용, 후속 조치를 적어주세요."
            rows={6}
            disabled={busy}
            required
          />
        </label>
        <label className={styles.editorLabel}>
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
        {error ? <div className={styles.editorError}>{error}</div> : null}
        <div className={styles.editorBtns}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            disabled={busy}
          >
            취소
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
