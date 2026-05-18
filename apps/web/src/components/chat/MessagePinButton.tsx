"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PinIcon } from "@/components/ui/icons";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "./MessagePinButton.module.css";

interface MessagePinButtonProps {
  roomId: string;
  messageId: string;
  isPinned: boolean;
}

export function MessagePinButton({ roomId, messageId, isPinned }: MessagePinButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isPinned) {
        await chatService.unpinMessage(roomId);
      } else {
        await chatService.pinMessage(roomId, messageId);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert(isPinned ? "고정 해제에 실패했습니다." : "고정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={styles.btn}
      onClick={onClick}
      disabled={busy}
      title={isPinned ? "고정 해제" : "메시지 고정"}
      aria-label={isPinned ? "고정 해제" : "메시지 고정"}
    >
      <PinIcon size={12} />
      {busy ? "..." : isPinned ? "고정 해제" : "고정"}
    </button>
  );
}
