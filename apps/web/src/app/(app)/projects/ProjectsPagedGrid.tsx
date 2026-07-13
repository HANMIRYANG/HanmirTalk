"use client";

import { useState } from "react";
import Link from "next/link";
import type { Project } from "@hanmir/shared";
import { projectStatusLabel, salesStatusLabel } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Pagination } from "@/components/ui/Pagination";
import styles from "./projects.module.css";

const PAGE_SIZE = 12;

const TONE_BY_STATUS = {
  ready: "default" as const,
  in_progress: "blue" as const,
  review: "amber" as const,
  on_hold: "amber" as const,
  done: "green" as const,
  cancelled: "red" as const
};

interface ProjectsPagedGridProps {
  projects: Project[];
  view: "grid" | "list";
}

export function ProjectsPagedGrid({ projects, view }: ProjectsPagedGridProps) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged =
    projects.length > PAGE_SIZE
      ? projects.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
      : projects;

  if (view === "list") {
    return (
      <>
        <div className={styles.list}>
          {paged.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className={styles.row}>
              <div className={styles.rowName}>
                <span className={styles.rowTitle}>{p.name}</span>
                <span className={styles.rowCode}>{p.code}</span>
              </div>
              <div className={styles.rowDept}>{p.department}</div>
              <div className={styles.rowPeriod}>
                {p.startDate} ~ {p.dueDate}
              </div>
              <div className={styles.rowStatus}>
                <Tag tone={TONE_BY_STATUS[p.status]} dot>
                  {p.stageLabel || projectStatusLabel[p.status]}
                </Tag>
              </div>
              <div className={styles.rowProgress}>
                <ProgressBar value={p.progress} className={styles.rowBar} />
                <span className={styles.progressVal}>{p.progress}%</span>
              </div>
            </Link>
          ))}
        </div>
        <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
      </>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {paged.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardTitle}>{p.name}</div>
              <Tag tone={TONE_BY_STATUS[p.status]} dot>
                {p.stageLabel || projectStatusLabel[p.status]}
              </Tag>
            </div>
            <div className={styles.cardMeta}>
              {p.department} · 책임 {p.ownerName}
            </div>
            <div className={styles.cardPeriod}>
              <span>
                {p.startDate} ~ {p.dueDate}
              </span>
              {p.code ? <span className={styles.cardCode}>{p.code}</span> : null}
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
      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
    </>
  );
}
