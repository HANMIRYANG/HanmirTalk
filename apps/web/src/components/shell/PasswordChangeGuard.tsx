"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Client guard for Phase 1 D-2: while the current user still has the
// admin-issued initial password, force every navigation back to
// /account/password until they change it. The /account/password page is
// the only allowed destination.
export function PasswordChangeGuard({
  mustChangePassword
}: {
  mustChangePassword: boolean;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  useEffect(() => {
    if (!mustChangePassword) return;
    if (pathname.startsWith("/account/password")) return;
    router.replace("/account/password");
  }, [mustChangePassword, pathname, router]);

  return null;
}
