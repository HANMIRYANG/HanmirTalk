import Link from "next/link";
import { SearchIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/Avatar";
import { authService } from "@/services/auth.service";
import { notificationService } from "@/services/notification.service";
import { getServerToken } from "@/lib/server-auth";
import { NotificationBell } from "./NotificationBell";
import styles from "./Topbar.module.css";

interface TopbarProps {
  title: string;
  sub?: string;
}

function initialsOf(name: string): string {
  return name.slice(0, 2);
}

// Server component: pulls the current user + initial unread notification
// count every render. The NotificationBell client component then keeps
// the count in sync via socket events (notification:new) without needing
// to re-render the whole Topbar.
export async function Topbar({ title, sub }: TopbarProps) {
  const token = getServerToken();
  const me = await authService.tryGetMe(token);
  const unreadCount = me
    ? await notificationService.unreadCount({ token }).catch(() => 0)
    : 0;

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {sub ? <div className={styles.sub}>{sub}</div> : null}
      </div>

      <div className={styles.center}>
        <form action="/search" className={styles.search}>
          <SearchIcon size={14} />
          <input
            name="q"
            placeholder="통합 검색 (2자 이상)"
            aria-label="검색"
          />
        </form>
      </div>

      <div className={styles.right}>
        {me ? <NotificationBell initialUnreadCount={unreadCount} /> : null}
        <Link href="/dashboard" className={styles.userBlock} aria-label="대시보드 이동">
          <Avatar
            initials={me?.initials ?? initialsOf(me?.name ?? "?")}
            tone={me?.avatarTone ?? "default"}
            size="md"
          />
          <div className={styles.user}>
            <div className={styles.userName}>{me?.name ?? "로그인 필요"}</div>
            <div className={styles.userMeta}>
              {me ? `${me.departmentName ?? ""} · ${me.position ?? ""}` : ""}
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}
