import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@hanmir/shared";
import { authService } from "@/services/auth.service";

export const SESSION_COOKIE = "hanmir_token";
export const BOUNCE_GUARD_COOKIE = "hanmir_bounced";

// bounce 리다이렉트는 브라우저가 따라가므로 SSR 내부 주소(API_BASE_URL)가
// 아닌 공개 API 주소를 써야 한다. 운영 빌드에서는 "/api/v1"(동일 오리진).
const PUBLIC_API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:4000/api/v1"
).replace(/\/$/, "");

export function getServerToken(): string | undefined {
  const value = cookies().get(SESSION_COOKIE)?.value;
  return value && value.trim() ? value : undefined;
}

// 세션 만료 시 곧장 /login 으로 보내는 대신 API 의 GET /auth/bounce 로
// 브라우저를 리다이렉트해 리프레시 회전을 시도한다. 리프레시 쿠키가
// Path=/api/v1/auth 로 스코프돼 페이지 요청(SSR)에는 아예 실리지 않기
// 때문에, 쿠키 Path 와 일치하는 API 경로로 한 번 튕겨야만 갱신이 가능.
// bounce 가 심는 hanmir_bounced 가드 쿠키가 이미 있으면(직전 bounce 가
// 실패했거나 방금 다녀옴) 루프 방지를 위해 기존대로 /login 으로 보낸다.
export function redirectToBounceOrLogin(next: string = "/"): never {
  if (cookies().get(BOUNCE_GUARD_COOKIE)?.value) redirect("/login");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(`${PUBLIC_API_BASE}/auth/bounce?next=${encodeURIComponent(safeNext)}`);
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
// wiped on every server restart (or after the 1-hour TTL), leaving the
// browser's hanmir_token cookie pointing at a session the server no
// longer knows about. redirectToBounceOrLogin routes that through
// GET /auth/bounce so a valid refresh cookie recovers the session
// silently instead of forcing re-login.
export async function requireServerMe(): Promise<{ me: User; token: string }> {
  const token = getServerToken();
  if (!token) redirectToBounceOrLogin();
  const me = await authService.tryGetMe(token);
  if (!me) redirectToBounceOrLogin();
  return { me, token };
}
