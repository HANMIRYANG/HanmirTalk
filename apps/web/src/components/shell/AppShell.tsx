import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { NoticeLive } from "./NoticeLive";
import { PasswordChangeGuard } from "./PasswordChangeGuard";
import { PwaRegister } from "./PwaRegister";

interface AppShellProps {
  children: ReactNode;
  mustChangePassword?: boolean;
}

export function AppShell({ children, mustChangePassword = false }: AppShellProps) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        {children}
        <MobileNav />
      </div>
      <NoticeLive />
      <PwaRegister />
      <PasswordChangeGuard mustChangePassword={mustChangePassword} />
    </div>
  );
}
