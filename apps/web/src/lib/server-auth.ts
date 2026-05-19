import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@hanmir/shared";
import { authService } from "@/services/auth.service";

export const SESSION_COOKIE = "hanmir_token";

export function getServerToken(): string | undefined {
  const value = cookies().get(SESSION_COOKIE)?.value;
  return value && value.trim() ? value : undefined;
}

// Server-only helper for (app)/* pages. Returns { me, token } when the
// session is valid, or redirects to /login when it isn't.
//
// Why this exists: Next.js App Router renders layouts and pages in
// parallel. (app)/layout.tsx already catches 401 via tryGetMe + redirect,
// but pages that call `authService.getMe(token)` directly throw an
// ApiError before the parent redirect propagates — producing the noisy
// "ApiError: unauthorized" terminal log even though the browser ends up
// at /login correctly. Funnelling pages through this helper turns the
// 401 into a clean redirect and lines up with the layout's behavior.
//
// The 401 trigger in practice: the server's in-memory sessionStore is
// wiped on every `npm run dev` restart (or after the 1-hour TTL),
// leaving the browser's hanmir_token cookie pointing at a session the
// server no longer knows about. A future Next.js middleware + SSR
// /auth/refresh round trip would let us recover silently; until then
// this helper keeps the failure mode clean.
export async function requireServerMe(): Promise<{ me: User; token: string }> {
  const token = getServerToken();
  if (!token) redirect("/login");
  const me = await authService.tryGetMe(token);
  if (!me) redirect("/login");
  return { me, token };
}
