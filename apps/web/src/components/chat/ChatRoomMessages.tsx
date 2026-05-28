"use client";

import { useEffect, useState } from "react";
import type { ChatMessage, User } from "@hanmir/shared";
import { MessageItem } from "./MessageItem";
import { ThreadDrawer } from "./ThreadDrawer";

// Phase 11 — 채팅방 메시지 리스트 + ThreadDrawer 상태를 함께 관리하는
// client wrapper. server component(`chat/[roomId]/page.tsx`) 는 SSR 로
// messages / me / users 등을 받아 그대로 전달한다.
//
// drawer 가 열려 있을 때 socket 으로 message:thread:updated 가 들어와
// SSR refresh 되면 messages prop 이 갱신되고, drawer 의 parentMessage 도
// 같은 id 로 다시 찾아 갱신한다 (useEffect 로 동기화).

interface ChatRoomMessagesProps {
  roomId: string;
  messages: ChatMessage[];
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
  currentUserId,
  isAdmin,
  pinnedMessageId,
  canCreateDecision,
  canCreateTask,
  projectId,
  users
}: ChatRoomMessagesProps) {
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  // SSR refresh 로 messages 가 갱신되면 열린 drawer 의 parent 도 동일 id 로
  // 다시 찾아온다. 부모 메시지가 삭제되면 drawer 를 닫는다.
  const parentMessage = openThreadId
    ? messages.find((m) => m.id === openThreadId)
    : undefined;

  useEffect(() => {
    if (openThreadId && !parentMessage) {
      setOpenThreadId(null);
    }
  }, [openThreadId, parentMessage]);

  return (
    <>
      {messages.map((m) => (
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
