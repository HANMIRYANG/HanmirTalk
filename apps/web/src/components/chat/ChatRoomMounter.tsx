"use client";

import { useEffect, useRef } from "react";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";

interface ChatRoomMounterProps {
  roomId: string;
  latestMessageId: string | undefined;
}

// Fires once when a chat room loads (and again whenever the latest visible
// message id changes) to mark messages as read for the current user. Failures
// are swallowed: read tracking is best-effort and shouldn't crash the page.
export function ChatRoomMounter({ roomId, latestMessageId }: ChatRoomMounterProps) {
  const lastMarked = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!latestMessageId) return;
    if (lastMarked.current === latestMessageId) return;
    lastMarked.current = latestMessageId;
    chatService.markRead(roomId, latestMessageId).catch((err) => {
      if (err instanceof ApiError) {
        // 401 → layout guard will redirect on the next navigation; we don't
        // surface anything inline here since this is a background sync.
        return;
      }
    });
  }, [roomId, latestMessageId]);

  return null;
}
