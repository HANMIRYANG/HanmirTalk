"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PinnedMessageRef } from "@hanmir/shared";
import { PinIcon } from "@/components/ui/icons";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "./PinnedBanner.module.css";

interface PinnedBannerProps {
  roomId: string;
  pinned: PinnedMessageRef;
}

export function PinnedBanner({ roomId, pinned }: PinnedBannerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onUnpin = async () => {
    if (busy) return;
    if (!window.confirm("이 메시지의 고정을 해제하시겠습니까?")) return;
    setBusy(true);
    try {
      await chatService.unpinMessage(roomId);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert("고정 해제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.banner}>
      <PinIcon size={14} />
      <div className={styles.text}>
        <b>고정 메시지</b> · {pinned.authorName}: {pinned.body}
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={onUnpin}
        disabled={busy}
        style={{ marginLeft: "auto" }}
      >
        {busy ? "처리 중..." : "고정 해제"}
      </button>
    </div>
  );
}
