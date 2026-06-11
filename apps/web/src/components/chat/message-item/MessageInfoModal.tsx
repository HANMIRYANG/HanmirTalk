"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MessageReactionDetail, MessageReadStatus } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "@/app/(app)/notices/readStatus.module.css";

interface MessageInfoModalProps {
  messageId: string;
  onClose: () => void;
}

function initials(name: string): string {
  return name.slice(0, 2);
}

// 메시지 읽음/반응 상세 모달. 읽음 여부는 방 멤버(작성자 제외)의
// last_read 포인터 기준이라 "여기까지 읽음" 의미 — 메시지별 개별
// 확인이 아니다. 반응 탭은 이모지별 사용자 목록.
export function MessageInfoModal({ messageId, onClose }: MessageInfoModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readStatus, setReadStatus] = useState<MessageReadStatus | null>(null);
  const [reactions, setReactions] = useState<MessageReactionDetail[] | null>(null);
  const [tab, setTab] = useState<"unread" | "read" | "reactions">("unread");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      chatService.getMessageReadStatus(messageId),
      chatService.listReactionDetails(messageId)
    ])
      .then(([rs, rd]) => {
        if (cancelled) return;
        setReadStatus(rs);
        setReactions(rd);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          handleSessionExpired(router);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setError("메시지를 찾을 수 없습니다.");
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
  }, [messageId, router]);

  const reactionCount =
    reactions?.reduce((sum, r) => sum + r.users.length, 0) ?? 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="메시지 확인 현황"
      description={
        readStatus
          ? `멤버 ${readStatus.readers.length + readStatus.unread.length}명 중 ${readStatus.readers.length}명 읽음 (작성자 제외)`
          : "방 멤버 기준"
      }
      width={520}
    >
      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === "unread" ? styles.tabActive : styles.tab}
          onClick={() => setTab("unread")}
        >
          안 읽음 {readStatus ? `(${readStatus.unread.length})` : ""}
        </button>
        <button
          type="button"
          className={tab === "read" ? styles.tabActive : styles.tab}
          onClick={() => setTab("read")}
        >
          읽음 {readStatus ? `(${readStatus.readers.length})` : ""}
        </button>
        <button
          type="button"
          className={tab === "reactions" ? styles.tabActive : styles.tab}
          onClick={() => setTab("reactions")}
        >
          반응 {reactions ? `(${reactionCount})` : ""}
        </button>
      </div>
      {loading ? (
        <div className={styles.empty}>불러오는 중...</div>
      ) : error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : tab === "reactions" ? (
        !reactions || reactions.length === 0 ? (
          <div className={styles.empty}>아직 반응이 없습니다.</div>
        ) : (
          <div>
            {reactions.map((r) => (
              <div key={r.emoji}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "10px 2px 2px"
                  }}
                >
                  {r.emoji} {r.users.length}명
                </div>
                <ul className={styles.list}>
                  {r.users.map((u) => (
                    <li key={`${r.emoji}-${u.userId}`} className={styles.row}>
                      <Avatar initials={initials(u.name)} tone="default" size="sm" />
                      <div className={styles.who}>
                        <div className={styles.name}>{u.name}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      ) : (
        (() => {
          const rows =
            tab === "read" ? readStatus?.readers ?? [] : readStatus?.unread ?? [];
          if (rows.length === 0) {
            return <div className={styles.empty}>해당 그룹의 사용자가 없습니다.</div>;
          }
          return (
            <ul className={styles.list}>
              {rows.map((u) => (
                <li key={u.userId} className={styles.row}>
                  <Avatar initials={initials(u.name)} tone="default" size="sm" />
                  <div className={styles.who}>
                    <div className={styles.name}>{u.name}</div>
                    <div className={styles.dept}>{u.departmentName}</div>
                  </div>
                </li>
              ))}
            </ul>
          );
        })()
      )}
    </Modal>
  );
}
