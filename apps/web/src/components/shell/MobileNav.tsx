"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/classNames";
import {
  ChatIcon,
  FileIcon,
  NoticeIcon,
  ProductIcon,
  ProjectIcon
} from "@/components/ui/icons";
import { useUnreadBadges, type UnreadBadges } from "./UnreadBadgesProvider";
import styles from "./MobileNav.module.css";

interface NavItem {
  key: string;
  href: string;
  label: string;
  Icon: (p: { size?: number }) => JSX.Element;
  badgeKey?: keyof UnreadBadges;
}

const NAV: NavItem[] = [
  { key: "chat", href: "/chat", label: "채팅", Icon: ChatIcon, badgeKey: "chat" },
  { key: "project", href: "/projects", label: "프로젝트", Icon: ProjectIcon },
  { key: "product", href: "/products", label: "제품", Icon: ProductIcon },
  { key: "file", href: "/files", label: "파일함", Icon: FileIcon },
  { key: "notice", href: "/notices", label: "공지", Icon: NoticeIcon, badgeKey: "notice" }
];

export function MobileNav() {
  const pathname = usePathname() ?? "/";
  const badges = useUnreadBadges();

  return (
    <nav className={cn("mobile-only", styles.nav)}>
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        const count = item.badgeKey ? badges[item.badgeKey] : 0;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(styles.item, active && styles.itemActive)}
          >
            <span className={styles.iconWrap}>
              <item.Icon size={18} />
              {count > 0 ? (
                <span className={styles.badge}>{count > 99 ? "99+" : count}</span>
              ) : null}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
