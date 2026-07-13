"use client";

import { useEffect, useState } from "react";
import type { Project } from "@hanmir/shared";
import { cn } from "@/lib/classNames";
import { ProjectCreateButton } from "./ProjectCreateButton";
import { ProjectsPagedGrid } from "./ProjectsPagedGrid";
import styles from "./projects.module.css";

const VIEW_STORAGE_KEY = "hanmir:projects:view";

type ViewMode = "grid" | "list";

const GridViewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const ListViewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);

interface ProjectsBrowserProps {
  projects: Project[];
}

export function ProjectsBrowser({ projects }: ProjectsBrowserProps) {
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    if (window.localStorage.getItem(VIEW_STORAGE_KEY) === "list") setView("list");
  }, []);

  const changeView = (v: ViewMode) => {
    setView(v);
    window.localStorage.setItem(VIEW_STORAGE_KEY, v);
  };

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarMeta}>{projects.length}개 프로젝트</div>
        <div className={styles.toolbarActions}>
          <div className={styles.seg}>
            <button
              type="button"
              title="그리드 보기"
              aria-label="그리드 보기"
              onClick={() => changeView("grid")}
              className={cn(styles.segBtn, view === "grid" && styles.segActive)}
            >
              <GridViewIcon />
            </button>
            <button
              type="button"
              title="리스트 보기"
              aria-label="리스트 보기"
              onClick={() => changeView("list")}
              className={cn(styles.segBtn, view === "list" && styles.segActive)}
            >
              <ListViewIcon />
            </button>
          </div>
          <ProjectCreateButton />
        </div>
      </div>
      <ProjectsPagedGrid projects={projects} view={view} />
    </>
  );
}
