"use client";

import { useState } from "react";
import { NewChatModal } from "./NewChatModal";

// 채팅 홈 바로가기 패널의 [+ 새 채팅] — ChatList 헤더의 + 버튼과 같은
// NewChatModal 을 연다 (본문 영역은 서버 컴포넌트라 여기서 상태만 관리).
export function NewChatLauncher({ currentUserId }: { currentUserId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
        + 새 채팅
      </button>
      {open ? (
        <NewChatModal currentUserId={currentUserId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
