"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationCategory, OrgNotificationDefault } from "@hanmir/shared";
import { notificationCategoryLabel } from "@hanmir/shared";
import { orgNotificationService } from "@/services/org-notification.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";

interface Props {
  initial: OrgNotificationDefault[];
}

const CATEGORY_DESC: Record<NotificationCategory, string> = {
  message: "채팅방에 새 메시지가 올라올 때",
  mention: "채팅 메시지에서 사용자를 @언급할 때",
  notice: "새 공지가 등록될 때",
  task: "사용자에게 업무가 배정될 때",
  project: "프로젝트 상태가 변경될 때",
  decision: "프로젝트에 결정사항이 등록될 때"
};

function formatUpdated(d: OrgNotificationDefault): string | null {
  if (!d.updatedAt) return null;
  const t = Date.parse(d.updatedAt);
  if (Number.isNaN(t)) return null;
  const date = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}.${p(date.getMonth() + 1)}.${p(date.getDate())}`;
  return d.updatedByName ? `${stamp} · ${d.updatedByName}` : stamp;
}

export function OrgNotificationsWorkspace({ initial }: Props) {
  const router = useRouter();
  const [defaults, setDefaults] = useState<OrgNotificationDefault[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onToggle = async (category: string, enabled: boolean) => {
    if (busy) return;
    setBusy(category);
    setError(null);
    try {
      const updated = await orgNotificationService.setDefault(category, enabled);
      setDefaults((prev) =>
        prev.map((d) => (d.category === updated.category ? updated : d))
      );
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError("알림 정책 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card">
      <div className="card__head">
        <h3>알림 종류별 발송 정책</h3>
      </div>
      {error ? (
        <div
          className="t-xs"
          style={{ padding: "0 16px 8px", color: "#DC2626" }}
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <div>
        {defaults.map((d) => {
          const updated = formatUpdated(d);
          return (
            <div
              key={d.category}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 16px",
                borderBottom: "1px solid var(--border-soft)"
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>
                  {notificationCategoryLabel[d.category]}
                </div>
                <div className="muted t-xs">
                  {CATEGORY_DESC[d.category]}
                  {updated ? ` · 최근 변경 ${updated}` : ""}
                </div>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: busy ? "default" : "pointer"
                }}
              >
                <span
                  className="t-sm"
                  style={{ color: d.enabled ? "var(--brand-blue)" : "var(--text-3)" }}
                >
                  {d.enabled ? "발송" : "중지"}
                </span>
                <input
                  type="checkbox"
                  checked={d.enabled}
                  disabled={busy === d.category}
                  onChange={(e) => onToggle(d.category, e.target.checked)}
                />
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
