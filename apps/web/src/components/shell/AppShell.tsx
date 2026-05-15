import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

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
    </div>
  );
}
