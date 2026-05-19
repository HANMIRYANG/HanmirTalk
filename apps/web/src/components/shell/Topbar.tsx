import Link from "next/link";
import { BellIcon, SearchIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/Avatar";
import { authService } from "@/services/auth.service";
import { noticeService } from "@/services/notice.service";
import { getServerToken } from "@/lib/server-auth";
import styles from "./Topbar.module.css";

interface TopbarProps {
  title: string;
  sub?: string;
}

function initialsOf(name: string): string {
  return name.slice(0, 2);
}

// Server component: pulls the current user + unread mandatory notice count
// every render so the avatar / name / bell dot reflect reality. Falls back
// silently to placeholders when called outside an authenticated context.
export async function Topbar({ title, sub }: TopbarProps) {
  const token = getServerToken();
  const me = await authService.tryGetMe(token);
  const notices = me
    ? await noticeService.listNotices({ token }).catch(() => [])
    : [];
  const unreadCount = notices.filter((n) => n.isMandatory && !n.myConfirmed).length;

  return (
    <header className={styles.topbar}>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>{title}</h1>
        {sub ? <div className={styles.sub}>{sub}</div> : null}
      </div>
      <form action="/search" className={styles.search}>
        <SearchIcon size={14} />
        <input
          name="q"
          placeholder="메시지 검색 (2자 이상)"
          aria-label="검색"
        />
      </form>
      <Link
        href="/notices"
        className={styles.iconBtn}
        aria-label={unreadCount > 0 ? `확인 필요한 공지 ${unreadCount}건` : "공지"}
        title={unreadCount > 0 ? `확인 필요한 공지 ${unreadCount}건` : "공지"}
      >
        <BellIcon size={18} />
        {unreadCount > 0 ? <span className={styles.notifyDot} /> : null}
      </Link>
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
    </header>
  );
}
