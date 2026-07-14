"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { erpService } from "@/services/erp.service";
import { confirmDialog, alertDialog } from "@/components/ui/AppDialogHost";

export function CancelDocumentButton({ id }: { id: string; adminHint?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onCancel = async () => {
    if (busy) return;
    if (!(await confirmDialog("이 전표를 취소하면 차감된 재고가 복원됩니다. 계속할까요?", { danger: true }))) return;
    setBusy(true);
    try {
      await erpService.cancelDocument(id);
      router.refresh();
    } catch {
      alertDialog("취소에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={busy}>
      {busy ? "취소 중..." : "전표 취소"}
    </button>
  );
}
