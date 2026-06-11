"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { authService } from "@/services/auth.service";
import styles from "./Topbar.module.css";

interface UserMenuProps {
  me?: User;
}

// Topbar 우측 사용자 필드 — 클릭 시 계정 팝오버 메뉴.
// 내 정보 + 계정 설정/비밀번호 변경/알림 설정 링크 + 로그아웃.
export function UserMenu({ me }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 / Esc 로 닫기 (NotificationBell 과 동일 패턴).
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

  const onLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    // Sidebar 의 로그아웃과 동일 — 서버 logout 이 httpOnly 쿠키를 비운다.
    try {
      await authService.logout();
    } catch {
      // 서버 불통이어도 리다이렉트 — 쿠키는 자체 만료된다.
    }
    router.replace("/login");
    router.refresh();
  };

  if (!me) {
    return (
      <div className={styles.userBlock}>
        <Avatar initials="?" tone="default" size="md" />
        <div className={styles.user}>
          <div className={styles.userName}>로그인 필요</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.userWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.userBlock}
        aria-label="계정 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar
          initials={me.initials}
          tone={me.avatarTone ?? "default"}
          size="md"
        />
        <div className={styles.user}>
          <div className={styles.userName}>{me.name}</div>
          <div className={styles.userMeta}>
            {me.departmentName ?? ""} · {me.position ?? ""}
          </div>
        </div>
      </button>
      {open ? (
        <div className={styles.userPopover} role="menu">
          <div className={styles.menuHead}>
            <div className={styles.menuName}>{me.name}</div>
            <div className={styles.menuMeta}>{me.email}</div>
            <div className={styles.menuMeta}>
              {me.departmentName ?? ""} · {me.position ?? ""}
            </div>
          </div>
          <Link
            href="/account"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            계정 설정
          </Link>
          <Link
            href="/account/password"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            비밀번호 변경
          </Link>
          <Link
            href="/account/notifications"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            알림 설정
          </Link>
          <div className={styles.menuDivider} />
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuDanger}`}
            role="menuitem"
            onClick={onLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
