"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@hanmir/shared";
import { BellIcon } from "@/components/ui/icons";
import { notificationService } from "@/services/notification.service";
import { getSocket } from "@/lib/socket";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import styles from "./NotificationBell.module.css";

interface Props {
  initialUnreadCount: number;
}

// Phase 6 I-4a — Topbar 종 아이콘. 클릭 시 inbox popover. 새 알림은
// socket으로 즉시 unread 배지 갱신. 클릭 시 read mark + link 라우팅.
export function NotificationBell({ initialUnreadCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Listen for notification:new on the socket. Server emits to user:<id>
  // channel which the socket auto-joins on connect.
  useEffect(() => {
    const socket = getSocket();
    const onNew = (n: Notification) => {
      setUnread((c) => c + 1);
      setItems((prev) => [n, ...prev].slice(0, 20));
      // Optional: 브라우저 OS 알림 (settings.browserEnabled가 켜져있을 때만
      // — 클라이언트 측에서는 권한 여부만 보고 발사. settings 체크는 별도
      // /account/notifications에서 토글).
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          try {
            new Notification(n.title, { body: n.body, tag: n.id });
          } catch {
            // noop
          }
        }
      }
    };
    socket.on("notification:new", onNew);
    return () => {
      socket.off("notification:new", onNew);
    };
  }, []);

  // Close popover on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Lazy-load the list the first time the popover opens.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    notificationService
      .list({ limit: 20 })
      .then((list) => {
        if (!cancelled) {
          setItems(list);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  const handleClick = async (n: Notification) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!n.readAt) {
        await notificationService.markRead(n.id);
        setUnread((c) => Math.max(0, c - 1));
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
        );
      }
      setOpen(false);
      if (n.link) router.push(n.link);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
      }
    } finally {
      setBusy(false);
    }
  };

  const markAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await notificationService.markAllRead();
      setUnread(0);
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.btn}
        aria-label={unread > 0 ? `알림 ${unread}개` : "알림"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon size={18} />
        {unread > 0 ? <span className={styles.badge}>{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      {open ? (
        <div className={styles.popover} role="dialog" aria-label="알림 inbox">
          <div className={styles.head}>
            <h3 className={styles.title}>알림</h3>
            <div className={styles.headActions}>
              {unread > 0 ? (
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={markAll}
                  disabled={busy}
                >
                  모두 읽음
                </button>
              ) : null}
              <Link href="/account/notifications" className={styles.linkBtn}>
                설정
              </Link>
            </div>
          </div>
          <div className={styles.list}>
            {!loaded ? (
              <div className={styles.empty}>불러오는 중…</div>
            ) : items.length === 0 ? (
              <div className={styles.empty}>새 알림이 없습니다.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={cn(styles.item, !n.readAt && styles.itemUnread)}
                  onClick={() => handleClick(n)}
                  disabled={busy}
                >
                  <div className={styles.itemMain}>
                    <div className={styles.itemTitle}>{n.title}</div>
                    {n.body ? <div className={styles.itemBody}>{n.body}</div> : null}
                    <div className={styles.itemTime}>{formatRelative(n.createdAt)}</div>
                  </div>
                  {!n.readAt ? <span className={styles.dot} /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
