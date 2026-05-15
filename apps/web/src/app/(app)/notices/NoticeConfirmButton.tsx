"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { noticeService } from "@/services/notice.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";

interface NoticeConfirmButtonProps {
  noticeId: string;
}

export function NoticeConfirmButton({ noticeId }: NoticeConfirmButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await noticeService.confirmNotice(noticeId);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("세션이 만료되었습니다. 다시 로그인해 주세요.");
        handleSessionExpired(router);
      } else if (err instanceof ApiError && err.status === 403) {
        setError("확인 권한이 없습니다.");
      } else {
        setError("확인 처리에 실패했습니다.");
      }
      setBusy(false);
    }
  };

  return (
    <>
      <button className="btn btn--primary btn--sm" type="button" onClick={onClick} disabled={busy}>
        {busy ? "확인 중..." : "확인했습니다"}
      </button>
      {error ? (
        <span className="t-xs alert" role="alert" style={{ marginLeft: 8 }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
