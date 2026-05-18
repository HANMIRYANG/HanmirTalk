import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { projectService } from "@/services/project.service";
import { getServerToken } from "@/lib/server-auth";
import { projectStatusLabel, salesStatusLabel } from "@hanmir/shared";
import { ProjectCreateButton } from "./ProjectCreateButton";
import styles from "./projects.module.css";

const TONE_BY_STATUS = {
  ready: "default" as const,
  in_progress: "blue" as const,
  review: "amber" as const,
  on_hold: "amber" as const,
  done: "green" as const,
  cancelled: "red" as const
};

export default async function ProjectListPage() {
  const token = getServerToken();
  const projects = await projectService.listProjects({ token });

  return (
    <>
      <Topbar title="프로젝트" sub="진행 중인 프로젝트와 책임자, 진행률을 확인하세요." />
      <div className="content">
        <div className={styles.toolbar}>
          <div className={styles.toolbarMeta}>{projects.length}개 프로젝트</div>
          <ProjectCreateButton />
        </div>
        <div className={styles.grid}>
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.cover}>{p.code}</div>
                <Tag tone={TONE_BY_STATUS[p.status]} dot>
                  {projectStatusLabel[p.status]}
                </Tag>
              </div>
              <div className={styles.cardTitle}>{p.fullName}</div>
              <div className={styles.cardMeta}>
                {p.department} · 책임 {p.ownerName}
              </div>
              <div className={styles.cardMeta}>
                {p.startDate} ~ {p.dueDate}
              </div>
              <div className={styles.progressRow}>
                <ProgressBar value={p.progress} />
                <span className={styles.progressVal}>{p.progress}%</span>
              </div>
              <div className={styles.cardFoot}>
                <span>업무 {p.taskCounts.done}/{p.taskCounts.total}</span>
                {p.delayedCount > 0 ? (
                  <span className={styles.delayed}>지연 {p.delayedCount}</span>
                ) : (
                  <span>{p.salesStatus ? salesStatusLabel[p.salesStatus] : ""}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
