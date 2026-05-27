"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { getSocket } from "@/lib/socket";

interface ChatRoomMounterProps {
  roomId: string;
  latestMessageId: string | undefined;
}

// Two responsibilities for a chat room:
// 1. Fire markRead whenever the latest visible message id changes.
// 2. Subscribe to socket events for this room so the page re-fetches when
//    other users post, pin, or unpin.
export function ChatRoomMounter({ roomId, latestMessageId }: ChatRoomMounterProps) {
  const router = useRouter();
  const lastMarked = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!latestMessageId) return;
    if (lastMarked.current === latestMessageId) return;
    lastMarked.current = latestMessageId;
    chatService.markRead(roomId, latestMessageId).catch((err) => {
      if (err instanceof ApiError) {
        // 401 → layout guard handles the redirect on next navigation.
        return;
      }
    });
  }, [roomId, latestMessageId]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("room:join", roomId);
    const onMessage = () => router.refresh();
    const onPin = () => router.refresh();
    // Phase 2 E-1 — refresh on edit / delete so the SSR-rendered list
    // picks up the new body or tombstone. (Optimistic UI in MessageItem
    // already updates the local DOM immediately for the actor; this
    // covers other tab/users.)
    const onEdit = () => router.refresh();
    const onDelete = () => router.refresh();
    // Phase 11 — 답글 chip / 반응 갱신. drawer 가 열려 있는 경우 drawer
    // 가 자체 socket 리스너로 patch 하고, 본 mounter 는 timeline 의
    // chip / reactions 만 refresh 한다.
    const onThreadUpdated = () => router.refresh();
    const onReactionUpdated = () => router.refresh();
    socket.on("message:new", onMessage);
    socket.on("message:updated", onEdit);
    socket.on("message:deleted", onDelete);
    socket.on("room:pin", onPin);
    socket.on("message:thread:updated", onThreadUpdated);
    socket.on("message:reaction:updated", onReactionUpdated);
    return () => {
      socket.emit("room:leave", roomId);
      socket.off("message:new", onMessage);
      socket.off("message:updated", onEdit);
      socket.off("message:deleted", onDelete);
      socket.off("room:pin", onPin);
      socket.off("message:thread:updated", onThreadUpdated);
      socket.off("message:reaction:updated", onReactionUpdated);
    };
  }, [roomId, router]);

  return null;
}
