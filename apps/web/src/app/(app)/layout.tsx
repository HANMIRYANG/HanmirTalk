import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { getServerToken, redirectToBounceOrLogin } from "@/lib/server-auth";
import { authService } from "@/services/auth.service";

export const dynamic = "force-dynamic";

export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  // 레이아웃에서는 현재 pathname 을 알 수 없어(App Router 제약, 별도
  // middleware 없음) bounce 복귀 목적지는 "/"(→ /dashboard)로 둔다.
  // 목적은 정확한 경로 복원이 아니라 재로그인 없이 세션을 살리는 것.
  const token = getServerToken();
  if (!token) redirectToBounceOrLogin();

  const me = await authService.tryGetMe(token);
  if (!me) redirectToBounceOrLogin();

  return (
    <AppShell mustChangePassword={!!me.mustChangePassword}>{children}</AppShell>
  );
}
