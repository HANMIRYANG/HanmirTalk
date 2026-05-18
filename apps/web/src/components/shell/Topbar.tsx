import Link from "next/link";
import { BellIcon, SearchIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/Avatar";
import styles from "./Topbar.module.css";

interface TopbarProps {
  title: string;
  sub?: string;
}

export function Topbar({ title, sub }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.titleBlock}>
        <h1 className={styles.title}>{title}</h1>
        {sub ? <div className={styles.sub}>{sub}</div> : null}
      </div>
      <form action="/chat" className={styles.search}>
        <SearchIcon size={14} />
        <input
          name="q"
          placeholder="채팅, 프로젝트, 파일 검색"
          aria-label="검색"
        />
      </form>
      <Link
        href="/notices"
        className={styles.iconBtn}
        aria-label="공지 보기"
        title="공지"
      >
        <BellIcon size={18} />
        <span className={styles.notifyDot} />
      </Link>
      <Link href="/dashboard" className={styles.userBlock} aria-label="대시보드 이동">
        <Avatar initials="김민" tone="default" size="md" />
        <div className={styles.user}>
          <div className={styles.userName}>김민준</div>
          <div className={styles.userMeta}>생산기술팀 · 책임</div>
        </div>
      </Link>
    </header>
  );
}
