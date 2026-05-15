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
      <div className={styles.search}>
        <SearchIcon size={14} />
        <input placeholder="채팅, 프로젝트, 파일 검색" aria-label="검색" />
      </div>
      <button type="button" className={styles.iconBtn} aria-label="알림">
        <BellIcon size={18} />
        <span className={styles.notifyDot} />
      </button>
      <div className={styles.userBlock}>
        <Avatar initials="김민" tone="default" size="md" />
        <div className={styles.user}>
          <div className={styles.userName}>김민준</div>
          <div className={styles.userMeta}>생산기술팀 · 책임</div>
        </div>
      </div>
    </header>
  );
}
