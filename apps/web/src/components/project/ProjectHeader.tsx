import Link from "next/link";
import type { Project } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { PinIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import styles from "./ProjectHeader.module.css";

interface ProjectHeaderProps {
  project: Project;
  variant?: "detail" | "compact";
  activeTab: "overview" | "tasks" | "gantt" | "chat" | "files" | "decisions" | "settings";
  rightActions?: React.ReactNode;
}

const TABS: { key: ProjectHeaderProps["activeTab"]; label: string; href?: (id: string) => string; num?: (p: Project) => string }[] = [
  { key: "overview", label: "개요", href: (id) => `/projects/${id}` },
  { key: "tasks", label: "업무", href: (id) => `/projects/${id}/tasks`, num: (p) => String(p.taskCounts.total) },
  { key: "gantt", label: "간트", href: (id) => `/projects/${id}/gantt` },
  // TODO(chat): map project → its room id when project rooms are introduced.
  { key: "chat", label: "대화", href: () => "/chat/r-p2410" },
  { key: "files", label: "파일", href: (id) => `/projects/${id}/files` },
  { key: "decisions", label: "결정 기록" },
  { key: "settings", label: "설정" }
];

export function ProjectHeader({
  project,
  variant = "compact",
  activeTab,
  rightActions
}: ProjectHeaderProps) {
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
        <div className={styles.actions}>
          {rightActions ?? (
            <>
              <button className="btn btn--outline btn--sm" type="button">
                <PinIcon size={14} />
                즐겨찾기
              </button>
              <button className="btn btn--outline btn--sm" type="button">
                상태 변경
              </button>
              <button className="btn btn--primary btn--sm" type="button">
                + 업무 추가
              </button>
            </>
          )}
        </div>
      </div>

      <nav className={styles.tabs}>
        {TABS.map((tab) => {
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
