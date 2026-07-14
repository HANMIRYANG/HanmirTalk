"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { alertDialog } from "@/components/ui/AppDialogHost";

interface Props {
  ownerId: string;
  // True when the viewer IS the owner — then we hide the button (you
  // can't DM yourself; server rejects with cannot_dm_self anyway).
  isSelf: boolean;
}

// Phase 4 G-2c — start a 1:1 chat with the product owner. Idempotent
// (findOrCreateDirect on the server), so safe to click repeatedly.
export function ProductOwnerChatButton({ ownerId, isSelf }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (isSelf) return null;

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const room = await chatService.openDirectMessage(ownerId);
      router.push(`/chat/${room.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      alertDialog("대화방을 열 수 없습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="btn btn--outline btn--sm mt-12"
      style={{ width: "100%" }}
      type="button"
      onClick={onClick}
      disabled={busy}
    >
      {busy ? "대화방 여는 중…" : "1:1 대화 시작"}
    </button>
  );
}
