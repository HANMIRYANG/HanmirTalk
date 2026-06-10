"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import { usePathname } from "next/navigation";
import { chatService } from "@/services/chat.service";
import { noticeService } from "@/services/notice.service";
import { getSocket } from "@/lib/socket";

export interface UnreadBadges {
  // 뮤트 안 된 방들의 미읽음 메시지 합
  chat: number;
  // 내가 아직 확인하지 않은 필독 공지 수
  notice: number;
}

const UnreadBadgesContext = createContext<UnreadBadges>({ chat: 0, notice: 0 });

// 사이드바/모바일 탭 공용 미읽음 배지 집계. Sidebar 와 MobileNav 가 동시에
// 마운트되므로(데스크톱/모바일 CSS 토글) fetch 는 provider 한 곳에서만.
// 갱신 시점:
//   - 경로 변경 — 채팅방을 읽고 나오거나 공지를 확인한 직후 반영
//   - notification:new / notice:new 소켓 이벤트 — 수신 즉시 반영
//     (폭주 시 trailing debounce 로 한 번만 재조회)
export function UnreadBadgesProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<UnreadBadges>({ chat: 0, notice: 0 });

  const refresh = useCallback(async () => {
    try {
      const [rooms, notices] = await Promise.all([
        chatService.listRooms(),
        noticeService.listNotices()
      ]);
      setBadges({
        chat: rooms.reduce((acc, r) => (r.muted ? acc : acc + (r.unread ?? 0)), 0),
        notice: notices.reduce(
          (acc, n) => (n.isMandatory && !n.myConfirmed ? acc + 1 : acc),
          0
        )
      });
    } catch {
      // 세션 만료/일시 오류 — 기존 값 유지. 다음 갱신 시점에 재시도.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const socket = getSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void refresh();
      }, 600);
    };
    socket.on("notification:new", schedule);
    socket.on("notice:new", schedule);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off("notification:new", schedule);
      socket.off("notice:new", schedule);
    };
  }, [refresh]);

  return (
    <UnreadBadgesContext.Provider value={badges}>{children}</UnreadBadgesContext.Provider>
  );
}

export function useUnreadBadges(): UnreadBadges {
  return useContext(UnreadBadgesContext);
}
