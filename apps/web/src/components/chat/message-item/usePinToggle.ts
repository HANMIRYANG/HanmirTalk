"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { alertDialog } from "@/components/ui/AppDialogHost";

interface UsePinToggleOptions {
  roomId: string;
  messageId: string;
  isPinned: boolean;
}

// 메시지 고정/해제 — 우클릭 컨텍스트 메뉴에서 호출된다.
export function usePinToggle({ roomId, messageId, isPinned }: UsePinToggleOptions) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
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
      alertDialog(isPinned ? "고정 해제에 실패했습니다." : "고정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return { busy, toggle };
}
