"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Phase 8 K-6 — uptime / 소켓 수는 시간에 따라 변하므로 수동 새로고침.
export function StatusRefresh() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <button
      type="button"
      className="btn btn--outline btn--sm"
      disabled={refreshing}
      onClick={() => {
        setRefreshing(true);
        router.refresh();
        // SSR refresh has no completion callback — clear the flag shortly after.
        window.setTimeout(() => setRefreshing(false), 800);
      }}
    >
      {refreshing ? "새로고침 중..." : "새로고침"}
    </button>
  );
}
