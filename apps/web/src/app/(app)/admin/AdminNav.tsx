"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import styles from "./admin.module.css";

interface NavItem {
  label: string;
  href: string;
  icon?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

// Items whose href contains a hash jump to a section of /admin; the rest are
// real /admin/* routes (Phase 8 K-1~K-6) or cross-area links.
const GROUPS: NavGroup[] = [
  {
    title: "개요",
    items: [{ label: "관리자 대시보드", href: "/admin", icon: true }]
  },
  {
    title: "사용자",
    items: [
      { label: "계정 관리", href: "/admin#users" },
      { label: "권한 / 역할", href: "/admin/permissions" },
      { label: "부서 관리", href: "/admin#departments" },
      { label: "초대 / 가입 승인", href: "/admin/invitations" }
    ]
  },
  {
    title: "콘텐츠",
    items: [
      { label: "프로젝트 관리", href: "/projects" },
      { label: "채팅방 관리", href: "/chat" },
      { label: "공지 발송 관리", href: "/notices" },
      { label: "제품정보 관리", href: "/products" },
      { label: "ERP 설정", href: "/admin/erp" }
    ]
  },
  {
    title: "정책",
    items: [
      { label: "파일 / 보존 정책", href: "/files" },
      { label: "보안 / 로그인", href: "/admin/security" },
      { label: "감사 로그", href: "/admin/audit" },
      { label: "알림 정책", href: "/admin/notifications" }
    ]
  },
  {
    title: "시스템",
    items: [{ label: "서비스 상태 / 버전", href: "/admin/status" }]
  }
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <aside className={styles.anav}>
      {GROUPS.map((group, gi) => (
        <div key={group.title}>
          <div
            className={styles.anavTitle}
            style={gi > 0 ? { marginTop: 10 } : undefined}
          >
            {group.title}
          </div>
          {group.items.map((item) => {
            // Hash links never persist a highlight; exact-path routes do.
            const active = item.href === pathname;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(styles.anavItem, active && styles.anavActive)}
              >
                {item.icon ? <ChatIcon size={14} /> : null}
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
