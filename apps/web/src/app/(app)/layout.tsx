import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getServerToken } from "@/lib/server-auth";
import { authService } from "@/services/auth.service";

export const dynamic = "force-dynamic";

export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const token = getServerToken();
  if (!token) redirect("/login");

  const me = await authService.tryGetMe(token);
  if (!me) redirect("/login");

  return <AppShell>{children}</AppShell>;
}
