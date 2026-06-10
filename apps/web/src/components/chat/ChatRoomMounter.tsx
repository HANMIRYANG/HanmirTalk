"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { getSocket } from "@/lib/socket";
import { useRefreshUnreadBadges } from "@/components/shell/UnreadBadgesProvider";

interface ChatRoomMounterProps {
  roomId: string;
  latestMessageId: string | undefined;
}

// 활발한 방에서 socket 이벤트가 초당 수회 들어와도 SSR refresh 는 이
// 윈도우당 최대 1회만 — 첫 이벤트는 즉시 반영해 체감 지연은 없다.
const REFRESH_WINDOW_MS = 800;

// Two responsibilities for a chat room:
// 1. Fire markRead whenever the latest visible message id changes.
// 2. Subscribe to socket events for this room so the page re-fetches when
//    other users post, pin, or unpin.
export function ChatRoomMounter({ roomId, latestMessageId }: ChatRoomMounterProps) {
  const router = useRouter();
  const refreshBadges = useRefreshUnreadBadges();
  const lastMarked = useRef<string | undefined>(undefined);
  const lastRefreshAt = useRef(0);
  const pendingRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);

  // leading + trailing throttle: 윈도우 안에 몰린 이벤트들은 마지막에
  // 한 번의 refresh 로 합쳐진다 (이벤트 유실 없음).
  const requestRefresh = useCallback(() => {
    const elapsed = Date.now() - lastRefreshAt.current;
    if (elapsed >= REFRESH_WINDOW_MS) {
      lastRefreshAt.current = Date.now();
      router.refresh();
      return;
    }
    if (pendingRefresh.current) return;
    pendingRefresh.current = setTimeout(() => {
      pendingRefresh.current = null;
      lastRefreshAt.current = Date.now();
      router.refresh();
    }, REFRESH_WINDOW_MS - elapsed);
  }, [router]);

  useEffect(() => {
    return () => {
      if (pendingRefresh.current) clearTimeout(pendingRefresh.current);
    };
  }, []);

  useEffect(() => {
    if (!latestMessageId) return;
    if (lastMarked.current === latestMessageId) return;
    lastMarked.current = latestMessageId;
    chatService
      .markRead(roomId, latestMessageId)
      .then(() => {
        // markRead 가 서버에 반영된 뒤에 배지를 재조회해야 순서가 보장됨
        // — 경로 변경 트리거에만 의존하면 경합으로 stale 배지가 남는다.
        refreshBadges();
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          // 401 → layout guard handles the redirect on next navigation.
          return;
        }
      });
  }, [roomId, latestMessageId, refreshBadges]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("room:join", roomId);
    // Phase 2 E-1 — refresh on edit / delete so the SSR-rendered list
    // picks up the new body or tombstone. (Optimistic UI in MessageItem
    // already updates the local DOM immediately for the actor; this
    // covers other tab/users.)
    // Phase 11 — 답글 chip / 반응 갱신. drawer 가 열려 있는 경우 drawer
    // 가 자체 socket 리스너로 patch 하고, 본 mounter 는 timeline 의
    // chip / reactions 만 refresh 한다.
    const onEvent = () => requestRefresh();
    socket.on("message:new", onEvent);
    socket.on("message:updated", onEvent);
    socket.on("message:deleted", onEvent);
    socket.on("room:pin", onEvent);
    socket.on("message:thread:updated", onEvent);
    socket.on("message:reaction:updated", onEvent);
    return () => {
      socket.emit("room:leave", roomId);
      socket.off("message:new", onEvent);
      socket.off("message:updated", onEvent);
      socket.off("message:deleted", onEvent);
      socket.off("room:pin", onEvent);
      socket.off("message:thread:updated", onEvent);
      socket.off("message:reaction:updated", onEvent);
    };
  }, [roomId, requestRefresh]);

  return null;
}
