"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DecisionReadStatus } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { decisionService } from "@/services/decision.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "@/app/(app)/notices/readStatus.module.css";

interface DecisionReadStatusButtonProps {
  decisionId: string;
}

function initials(name: string): string {
  return name.slice(0, 2);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

// 공지 확인 현황(NoticeReadStatusButton)과 동일 패턴. 서버는 작성자
// 또는 admin 에게만 응답 (403 not_decided_by_or_admin).
export function DecisionReadStatusButton({ decisionId }: DecisionReadStatusButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DecisionReadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"unconfirmed" | "confirmed">("unconfirmed");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setTab("unconfirmed");
    decisionService
      .getReadStatus(decisionId)
      .then((d) => {
        if (cancelled) return;
        if (d) setData(d);
        else setError("결정 사항을 찾을 수 없습니다.");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          handleSessionExpired(router);
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          setError("확인 현황 조회 권한이 없습니다.");
          return;
        }
        setError("조회에 실패했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, decisionId, router]);

  const rows =
    data && (tab === "confirmed" ? data.confirmed : data.unconfirmed);

  return (
    <>
      <button
        type="button"
        className="btn btn--outline btn--sm"
        onClick={() => setOpen(true)}
      >
        확인 현황
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="의사결정 확인 현황"
        description={
          data
            ? `총 ${data.totalRecipients}명 중 ${data.confirmed.length}명 확인`
            : "활성 사용자 기준"
        }
        width={520}
      >
        <div className={styles.tabs}>
          <button
            type="button"
            className={tab === "unconfirmed" ? styles.tabActive : styles.tab}
            onClick={() => setTab("unconfirmed")}
          >
            미확인 {data ? `(${data.unconfirmed.length})` : ""}
          </button>
          <button
            type="button"
            className={tab === "confirmed" ? styles.tabActive : styles.tab}
            onClick={() => setTab("confirmed")}
          >
            확인 {data ? `(${data.confirmed.length})` : ""}
          </button>
        </div>
        {loading ? (
          <div className={styles.empty}>불러오는 중...</div>
        ) : error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : !data || !rows ? null : rows.length === 0 ? (
          <div className={styles.empty}>해당 그룹의 사용자가 없습니다.</div>
        ) : (
          <ul className={styles.list}>
            {rows.map((u) => (
              <li key={u.userId} className={styles.row}>
                <Avatar initials={initials(u.name)} tone="default" size="sm" />
                <div className={styles.who}>
                  <div className={styles.name}>{u.name}</div>
                  <div className={styles.dept}>{u.departmentName}</div>
                </div>
                {u.confirmedAt ? (
                  <span className={styles.at}>{formatDateTime(u.confirmedAt)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
