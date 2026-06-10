import { Topbar } from "@/components/shell/Topbar";
import { noticeService } from "@/services/notice.service";
import { NoticeCreateButton } from "./NoticeCreateButton";
import { NoticesPagedList } from "./NoticesPagedList";
import { requireServerMe } from "@/lib/server-auth";
import styles from "./notices.module.css";

const MANAGE_ROLES = new Set(["admin", "super_admin"]);

export default async function NoticesPage() {
  const { me, token } = await requireServerMe();
  const notices = await noticeService.listNotices({ token });
  const canManage = MANAGE_ROLES.has(me.role);

  const mandatoryUnread = notices.filter((n) => n.isMandatory && !n.myConfirmed);
  const mandatoryCount = notices.filter((n) => n.isMandatory).length;
  const totalRecipients = notices.reduce((acc, n) => acc + n.totalRecipients, 0);
  const confirmedTotal = notices.reduce((acc, n) => acc + n.confirmedCount, 0);
  const averageConfirmRate = totalRecipients > 0 ? Math.round((confirmedTotal / totalRecipients) * 100) : 0;

  return (
    <>
      <Topbar title="공지" sub="필독 공지와 일반 공지를 확인하세요." />
      <div className="content">
        {canManage ? (
          <div className={styles.toolbar}>
            <div className={styles.toolbarMeta}>관리자 권한으로 공지를 작성할 수 있습니다.</div>
            <NoticeCreateButton />
          </div>
        ) : null}
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
            <div className="stat__sub">필독 {mandatoryCount}건 · 일반 {notices.length - mandatoryCount}건</div>
          </div>
          <div className="stat">
            <div className="stat__label">전사 평균 확인율</div>
            <div className="stat__value">
              {averageConfirmRate}
              %
            </div>
            <div className="stat__sub">최근 30일 기준</div>
          </div>
        </section>

        <NoticesPagedList notices={notices} canManage={canManage} />
      </div>
    </>
  );
}
