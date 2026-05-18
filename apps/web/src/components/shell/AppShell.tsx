import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { NoticeLive } from "./NoticeLive";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        {children}
        <MobileNav />
      </div>
      <NoticeLive />
    </div>
  );
}
