"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon, UsersIcon } from "@/components/ui/icons";

// 채팅방 우측 정보 패널(RoomInfoPane)의 열림 상태 공유 — 메인 헤더의
// [멤버] 버튼과 패널 헤더의 X 버튼이 같은 상태를 조작한다. 방 페이지는
// 서버 컴포넌트라 패널 본문은 children 으로 서버 렌더링을 유지하고,
// 여기서는 표시/숨김만 담당한다. 채팅방 자체를 닫고 목록으로 가는 것은
// 메인 헤더의 X(채팅방 닫기) — 이 패널 X 와 역할이 다르다.
const PanelCtx = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
} | null>(null);

export function RoomPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return <PanelCtx.Provider value={{ open, setOpen }}>{children}</PanelCtx.Provider>;
}

function usePanel() {
  const ctx = useContext(PanelCtx);
  if (!ctx) throw new Error("RoomPanelProvider가 상위에 없습니다.");
  return ctx;
}

// 메인 헤더의 [멤버] 버튼 — 우측 정보 패널 표시/숨김 토글.
export function RoomPanelToggleButton() {
  const { open, setOpen } = usePanel();
  return (
    <IconButton
      aria-label="우측 패널에 채팅방 정보·멤버 표시"
      title={open ? "우측 패널 숨기기" : "우측 패널에 채팅방 정보·멤버 표시"}
      aria-pressed={open}
      onClick={() => setOpen(!open)}
    >
      <UsersIcon size={18} />
    </IconButton>
  );
}

// 패널 본문 래퍼 — 닫힘 상태면 렌더하지 않는다. .row 그리드가
// `1fr auto` 라 패널이 빠지면 본문이 전체 폭을 차지한다.
export function RoomPanelBody({ children }: { children: ReactNode }) {
  const { open } = usePanel();
  return open ? <>{children}</> : null;
}

// 패널 헤더의 X — 이 패널만 닫는다.
export function RoomPanelCloseButton({ className }: { className?: string }) {
  const { setOpen } = usePanel();
  return (
    <IconButton
      aria-label="정보 패널 닫기"
      title="정보 패널 닫기"
      className={className}
      onClick={() => setOpen(false)}
    >
      <CloseIcon size={14} />
    </IconButton>
  );
}
