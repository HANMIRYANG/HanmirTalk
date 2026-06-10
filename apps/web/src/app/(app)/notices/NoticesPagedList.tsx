"use client";

import { useState } from "react";
import type { Notice } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Pagination } from "@/components/ui/Pagination";
import { NoticeConfirmButton } from "./NoticeConfirmButton";
import { NoticeReadStatusButton } from "./NoticeReadStatusButton";
import { cn } from "@/lib/classNames";
import styles from "./notices.module.css";

const PAGE_SIZE = 10;

const TONE_BY: Record<string, "red" | "amber" | "green"> = {
  red: "red",
  amber: "amber",
  green: "green"
};

interface NoticesPagedListProps {
  notices: Notice[];
  canManage: boolean;
}

export function NoticesPagedList({ notices, canManage }: NoticesPagedListProps) {
  const [page, setPage] = useState(1);

  // 필독 미확인 공지는 페이지네이션 없이 전체 표시한다.
  const mandatoryUnread = notices.filter((n) => n.isMandatory && !n.myConfirmed);

  const pageCount = Math.max(1, Math.ceil(notices.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged =
    notices.length > PAGE_SIZE
      ? notices.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
      : notices;

  return (
    <div className={styles.list}>
      <h2 className={styles.sectionTitle}>확인이 필요한 공지</h2>
      {mandatoryUnread.length === 0 ? (
        <div className={styles.empty}>현재 확인이 필요한 공지가 없습니다.</div>
      ) : (
        mandatoryUnread.map((n) => (
          <NoticeCard key={n.id} notice={n} canManage={canManage} />
        ))
      )}

      <h2 className={cn(styles.sectionTitle, styles.sectionTitleSpaced)}>전체 공지</h2>
      {paged.map((n) => (
        <NoticeCard key={`all-${n.id}`} notice={n} canManage={canManage} />
      ))}
      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
    </div>
  );
}

function NoticeCard({
  notice,
  canManage
}: {
  notice: Notice;
  canManage: boolean;
}) {
  const ratio = notice.totalRecipients > 0 ? Math.round((notice.confirmedCount / notice.totalRecipients) * 100) : 0;

  return (
    <article className={cn("card", styles.card)}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          {notice.isMandatory ? (
            <Tag tone={TONE_BY[notice.tone]} dot>
              {notice.myConfirmed ? "확인 완료" : "확인 필요"}
            </Tag>
          ) : (
            <Tag tone="green" dot>
              확인 완료
            </Tag>
          )}
          <div className={styles.title}>{notice.title}</div>
        </div>
        <div className={styles.meta}>
          {notice.authorTeam} · {notice.createdAt}
        </div>
      </div>
      <div className={styles.body}>{notice.body}</div>
      <div className={styles.foot}>
        <div className={styles.confirm}>
          <span>
            {notice.confirmedCount} / {notice.totalRecipients}명 확인 ({ratio}%)
          </span>
          <ProgressBar
            value={ratio}
            tone={notice.tone === "red" ? "orange" : notice.tone === "amber" ? "orange" : "green"}
            className={styles.confirmBar}
          />
        </div>
        <div className={styles.actions}>
          {notice.dueDate ? <span className={styles.due}>마감일 {notice.dueDate}</span> : null}
          {canManage ? <NoticeReadStatusButton noticeId={notice.id} /> : null}
          {!notice.myConfirmed ? (
            <NoticeConfirmButton noticeId={notice.id} />
          ) : (
            <span className={styles.confirmed}>확인했습니다 ✓</span>
          )}
        </div>
      </div>
    </article>
  );
}
