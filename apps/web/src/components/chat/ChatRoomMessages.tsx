"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, User } from "@hanmir/shared";
import { chatService } from "@/services/chat.service";
import { MessageItem } from "./MessageItem";
import { ThreadDrawer } from "./ThreadDrawer";
import styles from "./ChatRoomMessages.module.css";

// Phase 11 — 채팅방 메시지 리스트 + ThreadDrawer 상태를 함께 관리하는
// client wrapper. server component(`chat/[roomId]/page.tsx`) 는 SSR 로
// messages / me / users 등을 받아 그대로 전달한다.
//
// drawer 가 열려 있을 때 socket 으로 message:thread:updated 가 들어와
// SSR refresh 되면 messages prop 이 갱신되고, drawer 의 parentMessage 도
// 같은 id 로 다시 찾아 갱신한다 (useEffect 로 동기화).

const OLDER_PAGE_SIZE = 100;

// SSR 중 useLayoutEffect 경고 회피 — 서버에서는 no-op useEffect 로 대체.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface ChatRoomMessagesProps {
  roomId: string;
  messages: ChatMessage[];
  // SSR 윈도우가 가득 찼으면 true — 더 오래된 메시지가 있을 수 있다.
  mayHaveOlder?: boolean;
  currentUserId: string;
  isAdmin: boolean;
  pinnedMessageId?: string;
  canCreateDecision: boolean;
  canCreateTask: boolean;
  projectId?: string;
  users?: User[];
}

export function ChatRoomMessages({
  roomId,
  messages,
  mayHaveOlder = false,
  currentUserId,
  isAdmin,
  pinnedMessageId,
  canCreateDecision,
  canCreateTask,
  projectId,
  users
}: ChatRoomMessagesProps) {
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  // 타임라인은 페이지가 아니라 .msgs 컨테이너가 스크롤한다. 진입 시
  // 최신 메시지(맨 아래)로 이동하고, 이후에는 사용자가 바닥 근처에
  // 있을 때만 새 메시지를 따라 내려간다 (과거 대화를 읽는 중이면 유지).
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  // 위쪽을 보고 있는 동안 남의 새 메시지가 도착하면 표시하는 배지.
  const [showNewBadge, setShowNewBadge] = useState(false);
  // "이전 메시지 보기" 로 로드한 과거 메시지 — SSR refresh 가 와도 client
  // state 라 유지된다. SSR 윈도우와 겹치면 id 기준으로 중복 제거.
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);

  const allMessages = useMemo(() => {
    if (older.length === 0) return messages;
    const ssrIds = new Set(messages.map((m) => m.id));
    return [...older.filter((m) => !ssrIds.has(m.id)), ...messages];
  }, [older, messages]);

  const loadOlder = async () => {
    if (loadingOlder) return;
    const oldest = allMessages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const chunk = await chatService.listMessages(roomId, {
        limit: OLDER_PAGE_SIZE,
        before: oldest.id
      });
      if (chunk.length < OLDER_PAGE_SIZE) setReachedStart(true);
      if (chunk.length > 0) {
        setOlder((prev) => {
          const known = new Set([
            ...prev.map((m) => m.id),
            ...messages.map((m) => m.id)
          ]);
          return [...chunk.filter((m) => !known.has(m.id)), ...prev];
        });
      }
    } catch {
      // 일시 오류 — 버튼이 그대로 남아 재시도 가능.
    } finally {
      setLoadingOlder(false);
    }
  };

  // SSR refresh 로 messages 가 갱신되면 열린 drawer 의 parent 도 동일 id 로
  // 다시 찾아온다. 부모 메시지가 삭제되면 drawer 를 닫는다.
  const parentMessage = openThreadId
    ? allMessages.find((m) => m.id === openThreadId)
    : undefined;

  useEffect(() => {
    if (openThreadId && !parentMessage) {
      setOpenThreadId(null);
    }
  }, [openThreadId, parentMessage]);

  // 최초 진입 — 첫 페인트 전에 맨 아래(최신)로. smooth 없이 즉시 이동해
  // 위에서부터 훑고 내려오는 플래시를 방지한다.
  useIsomorphicLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 스크롤 위치로 "바닥에 붙어 있는지"를 추적 — 새 메시지가 렌더된 뒤가
  // 아니라 사용자가 스크롤한 시점 기준이라 첨부 등 큰 메시지에도 안전.
  useEffect(() => {
    const scroller = bottomRef.current?.parentElement;
    if (!scroller) return;
    const onScroll = () => {
      stickToBottom.current =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
      // 직접 스크롤해서 바닥에 닿으면 새 메시지 배지 해제.
      if (stickToBottom.current) setShowNewBadge(false);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  const latest = allMessages[allMessages.length - 1];
  const latestId = latest?.id;
  const latestIsMine = latest?.authorId === currentUserId;
  const prevLatestId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const isNewArrival =
      prevLatestId.current !== undefined && prevLatestId.current !== latestId;
    prevLatestId.current = latestId;
    // 내가 보낸 메시지는 위를 보고 있었어도 항상 최신으로 내려간다.
    // 남의 메시지는 바닥 근처에 있을 때만 따라가고, 아니면 배지 표시.
    if (latestIsMine || stickToBottom.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
      setShowNewBadge(false);
    } else if (isNewArrival) {
      setShowNewBadge(true);
    }
  }, [latestId, latestIsMine]);

  const jumpToLatest = () => {
    setShowNewBadge(false);
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  };

  return (
    <>
      {mayHaveOlder && !reachedStart ? (
        <div style={{ textAlign: "center", padding: "4px 0 10px" }}>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={loadOlder}
            disabled={loadingOlder}
          >
            {loadingOlder ? "불러오는 중..." : "이전 메시지 보기"}
          </button>
        </div>
      ) : null}
      {allMessages.map((m) => (
        <MessageItem
          key={m.id}
          message={m}
          roomId={roomId}
          isPinned={m.id === pinnedMessageId}
          canPin
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          canCreateDecision={canCreateDecision}
          canCreateTask={canCreateTask}
          users={users}
          projectId={projectId}
          onOpenThread={(target) => setOpenThreadId(target.id)}
        />
      ))}
      {showNewBadge ? (
        <div className={styles.newBadgeWrap}>
          <button type="button" className={styles.newBadge} onClick={jumpToLatest}>
            새 메시지 ↓
          </button>
        </div>
      ) : null}
      <div ref={bottomRef} aria-hidden="true" />
      {parentMessage ? (
        <ThreadDrawer
          parentMessage={parentMessage}
          roomId={roomId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          canCreateDecision={canCreateDecision}
          canCreateTask={canCreateTask}
          projectId={projectId}
          users={users}
          onClose={() => setOpenThreadId(null)}
        />
      ) : null}
    </>
  );
}
