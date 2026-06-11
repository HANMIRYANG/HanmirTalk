"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { authService } from "@/services/auth.service";

// Phase 1 D-3 — the access cookie is now httpOnly, so JS can no longer
// clear it via document.cookie. Call the server logout endpoint which
// revokes the refresh token row and emits Set-Cookie clears for both
// hanmir_token and hanmir_refresh.
async function clearSession(): Promise<void> {
  try {
    await authService.logout();
  } catch {
    // Silent — even if logout fails the redirect still happens; cookies
    // expire on their own and the server will reject the stale access
    // token at next request.
  }
}

function redirectToLogin(router: AppRouterInstance): void {
  router.replace("/login");
  router.refresh();
}

// Convenience used by client components catching 401s from write actions.
// Fire-and-forget the logout so the UI doesn't block on it; the redirect
// happens immediately.
export function handleSessionExpired(router: AppRouterInstance): void {
  void clearSession();
  redirectToLogin(router);
}
