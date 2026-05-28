"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage, User } from "@hanmir/shared";
import { CloseIcon } from "@/components/ui/icons";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { getSocket } from "@/lib/socket";
import { MessageItem } from "./MessageItem";
import styles from "./ThreadDrawer.module.css";

// Phase 11 — 스레드 답글 드로어.
//
// 우측에 고정되는 패널. 부모 메시지 1건 + 답글 목록 + 답글 입력기.
// 답글의 수정/삭제/이모지 반응은 MessageItem 이 그대로 처리 — drawer 는
// 답글 작성만 책임진다.
//
// v1 ReplyComposer 는 텍스트 전용. 멘션 popover 는 MessageComposer 와의
// 중복 회피를 위해 후속 PR 에서 공유 hook 으로 추출 후 도입한다.
// 본문에 `@이름` 을 그대로 적어도 서버는 받아주지만 entities 가 비어 있어
// mention notification 은 발사되지 않는다 (드러내놓고 한국어 안내로 표시).

interface ThreadDrawerProps {
  parentMessage: ChatMessage;
  roomId: string;
  currentUserId: string;
  isAdmin: boolean;
  canCreateDecision: boolean;
  canCreateTask: boolean;
  projectId?: string;
  users?: User[];
  onClose: () => void;
}

export function ThreadDrawer({
  parentMessage,
  roomId,
  currentUserId,
  isAdmin,
  canCreateDecision,
  canCreateTask,
  projectId,
  users,
  onClose
}: ThreadDrawerProps) {
  const router = useRouter();
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerValue, setComposerValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await chatService.listReplies(parentMessage.id);
      setReplies(list);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      // 다른 실패는 silent — 다음 socket 이벤트가 정상화한다.
    } finally {
      setLoading(false);
    }
  }, [parentMessage.id, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Socket 답글 이벤트 — 본 drawer 의 parentMessageId 와 일치하는 것만
  // patch. ChatRoomMounter 가 별도로 timeline 의 thread chip 을 갱신한다.
  //
  // 반응(message:reaction:updated) 은 broadcast payload 가 actor 기준
  // reactedByMe 라 단순 patch 하면 본 사용자 화면의 "내 반응" 표시가
  // 어긋난다. messageId 가 parent 또는 현재 replies 중 하나면 listReplies
  // 를 다시 호출해 본인 기준으로 재계산된 reactions[] 를 가져온다.
  // parent 메시지 자체의 반응은 chat page 의 SSR refresh 가 처리하므로
  // 별도 작업 불필요.
  useEffect(() => {
    const socket = getSocket();
    const onNew = (payload: { parentMessageId: string; reply: ChatMessage }) => {
      if (payload.parentMessageId !== parentMessage.id) return;
      setReplies((cur) => {
        if (cur.some((r) => r.id === payload.reply.id)) return cur;
        return [...cur, payload.reply];
      });
    };
    const onUpdated = (payload: { parentMessageId: string; reply: ChatMessage }) => {
      if (payload.parentMessageId !== parentMessage.id) return;
      setReplies((cur) => cur.map((r) => (r.id === payload.reply.id ? payload.reply : r)));
    };
    const onDeleted = (payload: { parentMessageId: string; reply: ChatMessage }) => {
      if (payload.parentMessageId !== parentMessage.id) return;
      // soft delete — 행을 유지하면서 masked 본문으로 교체.
      setReplies((cur) => cur.map((r) => (r.id === payload.reply.id ? payload.reply : r)));
    };
    const onReaction = (payload: { messageId: string }) => {
      if (
        payload.messageId !== parentMessage.id &&
        !replies.some((r) => r.id === payload.messageId)
      ) {
        return;
      }
      // listReplies 재호출 — 서버에서 본인 viewerUserId 기준으로
      // reactedByMe 가 정확히 채워진 응답을 받는다. parent 자체의 반응은
      // 페이지 refresh 로 다른 경로에서 처리되므로 drawer 는 답글만 챙김.
      if (replies.some((r) => r.id === payload.messageId)) {
        void refresh();
      }
    };
    socket.on("message:reply:new", onNew);
    socket.on("message:reply:updated", onUpdated);
    socket.on("message:reply:deleted", onDeleted);
    socket.on("message:reaction:updated", onReaction);
    return () => {
      socket.off("message:reply:new", onNew);
      socket.off("message:reply:updated", onUpdated);
      socket.off("message:reply:deleted", onDeleted);
      socket.off("message:reaction:updated", onReaction);
    };
  }, [parentMessage.id, replies, refresh]);

  // Esc 로 닫기.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    const trimmed = composerValue.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await chatService.createReply(parentMessage.id, { body: trimmed });
      setComposerValue("");
      textareaRef.current?.focus();
      // 본인의 답글은 socket 으로도 들어오겠지만 즉시 보이도록 refresh.
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          handleSessionExpired(router);
          return;
        }
        if (err.status === 409) {
          setError("부모 메시지가 삭제되어 답글을 달 수 없습니다.");
          return;
        }
        if (err.status === 404 || err.status === 403) {
          setError("이 채팅방의 멤버만 답글을 작성할 수 있습니다.");
          return;
        }
      }
      setError("답글 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <aside className={styles.drawer} aria-label="답글 스레드">
      <header className={styles.head}>
        <div>
          <div className={styles.title}>스레드</div>
          <div className={styles.subtitle}>
            {parentMessage.authorName} · {parentMessage.createdAt}
          </div>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="닫기"
          title="닫기 (Esc)"
        >
          <CloseIcon size={14} />
        </button>
      </header>

      <div className={styles.body}>
        {/* 부모 메시지 — 답글이 어떤 맥락인지 항상 보이도록 상단에 fixed. */}
        <div className={styles.parent}>
          <MessageItem
            message={parentMessage}
            roomId={roomId}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            canCreateDecision={canCreateDecision}
            canCreateTask={canCreateTask}
            projectId={projectId}
            users={users}
          />
        </div>
        <div className={styles.divider}>
          {replies.length > 0 ? `답글 ${replies.length}개` : "아직 답글이 없습니다"}
        </div>
        <div className={styles.replies}>
          {loading ? (
            <div className={styles.placeholder}>불러오는 중...</div>
          ) : (
            replies.map((r) => (
              <MessageItem
                key={r.id}
                message={r}
                roomId={roomId}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                // 답글 자체에는 결정사항/업무 만들기 / 답글 chip 노출
                // 하지 않음 (스레드 내부에서 중첩 답글은 미지원).
              />
            ))
          )}
        </div>
      </div>

      <div className={styles.composer}>
        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          rows={2}
          placeholder="이 메시지에 답글 달기..."
          value={composerValue}
          onChange={(e) => setComposerValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
          autoFocus
        />
        <div className={styles.composerFoot}>
          <span className={styles.hint}>
            <span className="kbd">Enter</span> 전송 ·{" "}
            <span className="kbd">Shift + Enter</span> 줄바꿈
          </span>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={send}
            disabled={sending || !composerValue.trim()}
          >
            {sending ? "전송 중..." : "답글 보내기"}
          </button>
        </div>
      </div>
    </aside>
  );
}
