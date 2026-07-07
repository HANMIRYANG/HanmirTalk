import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { NoticeLive } from "./NoticeLive";
import { PasswordChangeGuard } from "./PasswordChangeGuard";
import { PwaRegister } from "./PwaRegister";
import { UnreadBadgesProvider } from "./UnreadBadgesProvider";
import { MeetingRecorderProvider } from "@/components/meeting/MeetingRecorderProvider";
import { GlobalRecordingIndicator } from "@/components/meeting/GlobalRecordingIndicator";

interface AppShellProps {
  children: ReactNode;
  mustChangePassword?: boolean;
}

export function AppShell({ children, mustChangePassword = false }: AppShellProps) {
  return (
    <UnreadBadgesProvider>
      {/* 회의 녹음 엔진은 셸 레벨 — 방 페이지를 벗어나도 MediaRecorder/
          청크 업로드가 유지된다. 방 밖에서는 플로팅 인디케이터가 표시. */}
      <MeetingRecorderProvider>
        <div className="app">
          <Sidebar />
          <div className="main">
            {children}
            <MobileNav />
          </div>
          <NoticeLive />
          <PwaRegister />
          <PasswordChangeGuard mustChangePassword={mustChangePassword} />
          <GlobalRecordingIndicator />
        </div>
      </MeetingRecorderProvider>
    </UnreadBadgesProvider>
  );
}
