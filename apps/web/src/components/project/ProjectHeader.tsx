import Link from "next/link";
import type { Project } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/classNames";
import styles from "./ProjectHeader.module.css";

interface ProjectHeaderProps {
  project: Project;
  variant?: "detail" | "compact";
  activeTab: "overview" | "tasks" | "gantt" | "files" | "decisions" | "settings";
  rightActions?: React.ReactNode;
  // Phase 3 F-2c follow-up — the "결정 기록" tab points to a member-only
  // route. When provided, the header hides tabs the viewer can't reach
  // so they don't click into a 404. Pass `undefined` to keep the legacy
  // "show all tabs" behavior (server-side fallback still catches 404).
  viewer?: {
    isMember: boolean;
    isAdmin: boolean;
  };
}

interface TabDef {
  key: ProjectHeaderProps["activeTab"];
  label: string;
  href?: (id: string) => string;
  num?: (p: Project) => string;
  // When set, only viewers passing this predicate see the tab.
  visibleTo?: (viewer: NonNullable<ProjectHeaderProps["viewer"]>) => boolean;
}

const TABS: TabDef[] = [
  { key: "overview", label: "개요", href: (id) => `/projects/${id}` },
  { key: "tasks", label: "업무", href: (id) => `/projects/${id}/tasks`, num: (p) => String(p.taskCounts.total) },
  { key: "gantt", label: "간트", href: (id) => `/projects/${id}/gantt` },
  { key: "files", label: "파일", href: (id) => `/projects/${id}/files` },
  {
    key: "decisions",
    label: "결정 기록",
    href: (id) => `/projects/${id}/decisions`,
    // Decisions route is member-only on the server. Hide the tab for
    // viewers who can't open it; admin bypass mirrors the server.
    visibleTo: (v) => v.isAdmin || v.isMember
  },
  {
    key: "settings",
    label: "설정",
    href: (id) => `/projects/${id}/settings`,
    // 설정 페이지는 멤버(또는 admin)만 — 내부 편집 액션은 페이지에서
    // 관리 권한(writer+멤버)으로 한 번 더 게이트한다.
    visibleTo: (v) => v.isAdmin || v.isMember
  }
];

export function ProjectHeader({
  project,
  variant = "compact",
  activeTab,
  rightActions,
  viewer
}: ProjectHeaderProps) {
  // Filter tabs by viewer permissions. When `viewer` isn't passed, show
  // every tab (legacy behavior — server-side 404 catches still protect).
  const visibleTabs = viewer ? TABS.filter((t) => !t.visibleTo || t.visibleTo(viewer)) : TABS;
  return (
    <section className={cn(styles.ph, variant === "detail" && styles.phDetail)}>
      {variant === "detail" ? (
        <div className={styles.crumb}>
          <span>프로젝트</span>
          <span>›</span>
          <b>{project.department}</b>
          <span>›</span>
          <b>
            {project.code} {project.name}
          </b>
        </div>
      ) : null}

      <div className={cn(styles.top, variant === "detail" && styles.topDetail)}>
        <div className={cn(styles.cover, variant === "detail" && styles.coverDetail)}>
          {project.code}
        </div>
        <div>
          <div className={cn(styles.title, variant === "detail" && styles.titleDetail)}>
            {project.fullName}
          </div>
          <div className={styles.sub}>
            <Tag tone="blue" dot>
              {project.stageLabel}
            </Tag>
            <span className={styles.subSpacer}>
              {variant === "detail"
                ? `시작 ${project.startDate} · 마감 ${project.dueDate} · 책임 ${project.ownerName} · 멤버 ${project.memberIds.length}명`
                : `${project.department} · ${project.ownerName}`}
            </span>
          </div>
        </div>
        <div className={styles.actions}>{rightActions}</div>
      </div>

      <nav className={styles.tabs}>
        {visibleTabs.map((tab) => {
          const cls = cn(styles.tab, activeTab === tab.key && styles.tabActive);
          const content = (
            <>
              {tab.label}
              {tab.num ? <span className={styles.tabNum}>{tab.num(project)}</span> : null}
            </>
          );
          if (tab.href) {
            return (
              <Link key={tab.key} href={tab.href(project.id)} className={cls}>
                {content}
              </Link>
            );
          }
          return (
            <span key={tab.key} className={cls}>
              {content}
            </span>
          );
        })}
      </nav>
    </section>
  );
}
