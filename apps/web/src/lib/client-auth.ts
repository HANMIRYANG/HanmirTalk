"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export const SESSION_COOKIE = "hanmir_token";

export function clearSessionCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function redirectToLogin(router: AppRouterInstance): void {
  router.replace("/login");
  router.refresh();
}

// Convenience used by client components catching 401s from write actions.
export function handleSessionExpired(router: AppRouterInstance): void {
  clearSessionCookie();
  redirectToLogin(router);
}
