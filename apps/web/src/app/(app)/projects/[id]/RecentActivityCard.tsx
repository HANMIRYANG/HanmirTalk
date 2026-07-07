"use client";

// 프로젝트 상세 우측의 "최근 활동" 카드 — 4개씩 페이지네이션.
// (기존에는 page.tsx 서버 컴포넌트가 전체를 한 번에 렌더했음.)
import { useState } from "react";
import type { ActivityEvent } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Pagination } from "@/components/ui/Pagination";
import styles from "./detail.module.css";

const ACTIVITY_PAGE_SIZE = 4;

interface RecentActivityCardProps {
  activities: ActivityEvent[];
}

export function RecentActivityCard({ activities }: RecentActivityCardProps) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(activities.length / ACTIVITY_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = activities.slice(
    (safePage - 1) * ACTIVITY_PAGE_SIZE,
    safePage * ACTIVITY_PAGE_SIZE
  );

  return (
    <section className="card">
      <div className="card__head">
        <h3>최근 활동</h3>
      </div>
      <div className={styles.activityBody}>
        {paged.length === 0 ? (
          <div className="muted t-sm" style={{ padding: 12 }}>
            최근 활동이 없습니다.
          </div>
        ) : (
          paged.map((a) => (
            <div key={a.id} className={styles.activityRow}>
              <Avatar initials={a.initials} tone={a.tone ?? "default"} size="sm" />
              <div>
                <div className={styles.activityText}>
                  <b>{a.author}</b>
                  {a.body}
                </div>
                <div className={styles.activityTime}>{a.time}</div>
              </div>
            </div>
          ))
        )}
        <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
      </div>
    </section>
  );
}
