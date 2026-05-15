import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { noticeService } from "@/services/notice.service";
import { NoticeConfirmButton } from "./NoticeConfirmButton";
import { getServerToken } from "@/lib/server-auth";
import { cn } from "@/lib/classNames";
import styles from "./notices.module.css";

const TONE_BY: Record<string, "red" | "amber" | "green"> = {
  red: "red",
  amber: "amber",
  green: "green"
};

export default async function NoticesPage() {
  const token = getServerToken();
  const notices = await noticeService.listNotices({ token });

  const mandatoryUnread = notices.filter((n) => n.isMandatory && !n.myConfirmed);
  const others = notices.filter((n) => !(n.isMandatory && !n.myConfirmed));

  return (
    <>
      <Topbar title="공지" sub="필독 공지와 일반 공지를 확인하세요." />
      <div className="content">
        <section className={styles.summary}>
          <div className="stat">
            <div className="stat__label">확인이 필요한 공지</div>
            <div className="stat__value">{mandatoryUnread.length}</div>
            <div className="stat__sub">
              필독 <b className="alert">{mandatoryUnread.length}건</b>
            </div>
          </div>
          <div className="stat">
            <div className="stat__label">이번 달 등록된 공지</div>
            <div className="stat__value">{notices.length}</div>
            <div className="stat__sub">필독 2건 · 일반 1건</div>
          </div>
          <div className="stat">
            <div className="stat__label">전사 평균 확인율</div>
            <div className="stat__value">
              {Math.round(
                (notices.reduce((acc, n) => acc + n.confirmedCount, 0) /
                  notices.reduce((acc, n) => acc + n.totalRecipients, 0)) *
                  100
              )}
              %
            </div>
            <div className="stat__sub">최근 30일 기준</div>
          </div>
        </section>

        <div className={styles.list}>
          <h2 className={styles.sectionTitle}>확인이 필요한 공지</h2>
          {mandatoryUnread.length === 0 ? (
            <div className={styles.empty}>현재 확인이 필요한 공지가 없습니다.</div>
          ) : (
            mandatoryUnread.map((n) => <NoticeCard key={n.id} notice={n} />)
          )}

          <h2 className={cn(styles.sectionTitle, styles.sectionTitleSpaced)}>전체 공지</h2>
          {notices.map((n) => (
            <NoticeCard key={`all-${n.id}`} notice={n} />
          ))}
        </div>
      </div>
    </>
  );
}

function NoticeCard({
  notice
}: {
  notice: Awaited<ReturnType<typeof noticeService.listNotices>>[number];
}) {
  const ratio = Math.round((notice.confirmedCount / notice.totalRecipients) * 100);

  return (
    <article className={cn("card", styles.card)}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          {notice.isMandatory ? (
            <Tag tone={TONE_BY[notice.tone]}>{notice.myConfirmed ? "확인 완료" : "확인 필요"}</Tag>
          ) : (
            <Tag tone="green">확인 완료</Tag>
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
