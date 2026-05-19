"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/classNames";
import { authService } from "@/services/auth.service";
import {
  AdminIcon,
  ChatIcon,
  FileIcon,
  HomeIcon,
  LogoutIcon,
  NoticeIcon,
  ProductIcon,
  ProjectIcon,
  SettingsIcon
} from "@/components/ui/icons";
import styles from "./Sidebar.module.css";

interface NavItem {
  key: string;
  href: string;
  label: string;
  Icon: (p: { size?: number }) => JSX.Element;
}

const NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "대시보드", Icon: HomeIcon },
  { key: "chat", href: "/chat", label: "채팅", Icon: ChatIcon },
  { key: "project", href: "/projects", label: "프로젝트", Icon: ProjectIcon },
  { key: "product", href: "/products", label: "제품정보", Icon: ProductIcon },
  { key: "file", href: "/files", label: "파일함", Icon: FileIcon },
  { key: "notice", href: "/notices", label: "공지", Icon: NoticeIcon },
  { key: "admin", href: "/admin", label: "관리자", Icon: AdminIcon }
];

export function Sidebar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const isActive = (item: NavItem) => {
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  };

  const onLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    // Phase 1 D-3: server-side logout clears both httpOnly cookies via
    // Set-Cookie. JS can no longer touch the access cookie directly.
    try {
      await authService.logout();
    } catch {
      // Server unreachable — cookies expire on their own; redirect anyway
      // so the user isn't stranded on an authenticated route they can't
      // actually use.
    }
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside className={cn("sidebar desktop-only", styles.sidebar)}>
      <Link href="/chat" className={styles.logo} aria-label="한미르톡 홈">
        <span className={styles.logoBadge}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/hanmir-logo.png" alt="한미르 로고" />
        </span>
      </Link>
      <nav className={styles.nav}>
        {NAV.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(styles.navItem, isActive(item) && styles.navItemActive)}
          >
            <item.Icon size={20} />
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className={styles.bottom}>
        <button type="button" className={styles.navItem} aria-label="설정">
          <SettingsIcon size={20} />
          <span className={styles.navLabel}>설정</span>
        </button>
        <button
          type="button"
          className={styles.navItem}
          aria-label="로그아웃"
          onClick={onLogout}
          disabled={loggingOut}
        >
          <LogoutIcon size={20} />
          <span className={styles.navLabel}>{loggingOut ? "..." : "로그아웃"}</span>
        </button>
      </div>
    </aside>
  );
}
