"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "./MemberRemoveButton.module.css";

interface Props {
  roomId: string;
  userId: string;
  userName: string;
}

// Phase 4 G-2b 추가 — admin/super_admin이 다른 멤버를 채팅방에서
// 추방하는 버튼. RoomInfoPane(server) 내부에서 멤버 row마다 렌더.
// 본인 추방은 별도 ([더보기] → 방 나가기)이므로 여기서는 막음.
export function MemberRemoveButton({ roomId, userId, userName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    if (!window.confirm(`'${userName}' 님을 이 채팅방에서 추방하시겠습니까?`)) return;
    setBusy(true);
    try {
      await chatService.removeMember(roomId, userId);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        window.alert("추방 권한이 없습니다.");
        return;
      }
      window.alert("추방에 실패했습니다.");
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
      title={`${userName} 추방`}
      aria-label={`${userName} 추방`}
    >
      추방
    </button>
  );
}
