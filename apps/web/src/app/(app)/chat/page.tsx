import { Topbar } from "@/components/shell/Topbar";
import { ChatList } from "@/components/chat/ChatList";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { chatService } from "@/services/chat.service";
import { dashboardService } from "@/services/dashboard.service";
import { authService } from "@/services/auth.service";
import { getServerToken } from "@/lib/server-auth";
import styles from "./chat.module.css";

// Auth guard is enforced in apps/web/src/app/(app)/layout.tsx.
// Here we just need the token for downstream API calls.
export default async function ChatHomePage() {
  const token = getServerToken();
  const [me, rooms, activities] = await Promise.all([
    authService.getMe(token),
    chatService.listRooms({ token }),
    dashboardService.listDashboardActivities({ token })
  ]);

  return (
    <>
      <div className={styles.row}>
        <ChatList rooms={rooms} />
        <main className={styles.main}>
          <Topbar title="채팅" sub="회의실 1, 회의실 2, 회의실 3 ... 외 9개" />
          <div className="content">
            <div className={styles.dash}>
              <div className={styles.hello}>
                안녕하세요, <em>{me.name}</em> 책임님 👋
              </div>
              <div className={styles.helloSub}>
                오늘은 2026년 5월 13일 수요일 · 오늘의 업무 현황을 알려드립니다.
              </div>

              <div className={styles.statGrid}>
                <div className="stat">
                  <div className="stat__label">읽지 않은 메시지</div>
                  <div className="stat__value">12</div>
                  <div className="stat__sub">
                    멘션 <b className="alert">3건</b> 포함
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">진행 중인 프로젝트</div>
                  <div className="stat__value">3</div>
                  <div className="stat__sub">담당 2 · 참여 1</div>
                </div>
                <div className="stat">
                  <div className="stat__label">오늘 마감 업무</div>
                  <div className="stat__value">5</div>
                  <div className="stat__sub">
                    <b className="alert">2건 지연</b> · 3건 진행중
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">확인이 필요한 공지</div>
                  <div className="stat__value">2</div>
                  <div className="stat__sub">필독 1건 · 일반 1건</div>
                </div>
              </div>

              <div className={styles.dashGrid}>
                <section className="card">
                  <div className="card__head">
                    <div>
                      <div className="card__title">오늘의 업무</div>
                      <div className="card__sub">담당자: 김민준 · 5월 13일 기준</div>
                    </div>
                    <button className="btn btn--ghost btn--sm" style={{ marginLeft: "auto" }}>
                      전체 보기 →
                    </button>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.noticeRow}>
                      <div>
                        <div className={styles.noticeTitle}>SUS304 시험성적서 검토 회신</div>
                        <div className={styles.noticeMeta}>
                          P-2410 강판 자동화 라인 · 진행률 80%
                        </div>
                      </div>
                      <Tag tone="red" dot>
                        지연 1일
                      </Tag>
                    </div>
                    <div className={styles.noticeRow}>
                      <div>
                        <div className={styles.noticeTitle}>7월 생산일정 초안 작성</div>
                        <div className={styles.noticeMeta}>
                          P-2411 신소재 SPC · 마감일 오늘 18:00
                        </div>
                      </div>
                      <Tag tone="amber" dot>
                        오늘 마감
                      </Tag>
                    </div>
                    <div className={styles.noticeRow}>
                      <div>
                        <div className={styles.noticeTitle}>설비점검 체크리스트 승인</div>
                        <div className={styles.noticeMeta}>제조1팀 · 마감일 5월 14일</div>
                      </div>
                      <Tag tone="blue" dot>
                        진행중
                      </Tag>
                    </div>
                    <div className={styles.noticeRow}>
                      <div>
                        <div className={styles.noticeTitle}>월간 KPI 리뷰 자료 정리</div>
                        <div className={styles.noticeMeta}>
                          생산기술팀 정기보고 · 마감일 5월 16일
                        </div>
                      </div>
                      <Tag dot>대기</Tag>
                    </div>
                    <div className={styles.noticeRow}>
                      <div>
                        <div className={styles.noticeTitle}>신규 인입 자재 입고 확인</div>
                        <div className={styles.noticeMeta}>자재팀 협조 · 마감일 5월 16일</div>
                      </div>
                      <Tag tone="green" dot>
                        완료
                      </Tag>
                    </div>
                  </div>
                </section>

                <section className="card">
                  <div className="card__head">
                    <div>
                      <div className="card__title">확인이 필요한 공지</div>
                      <div className="card__sub">읽음/확인 처리 대기</div>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.noticeRow}>
                      <div>
                        <div className={styles.noticeTitle}>[필독] 7월 안전교육 이수 안내</div>
                        <div className={styles.noticeMeta}>인사팀 · 마감일 5월 20일</div>
                      </div>
                      <Tag tone="red">확인 필요</Tag>
                    </div>
                    <div className={styles.noticeRow}>
                      <div>
                        <div className={styles.noticeTitle}>사내 보안정책 개정 안내(v3.2)</div>
                        <div className={styles.noticeMeta}>정보지원팀 · 5월 12일</div>
                      </div>
                      <Tag tone="amber">확인 필요</Tag>
                    </div>
                    <div className={styles.noticeRow}>
                      <div>
                        <div className={styles.noticeTitle}>한미르톡 v2.4.1 업데이트 안내</div>
                        <div className={styles.noticeMeta}>시스템 공지 · 5월 11일</div>
                      </div>
                      <Tag tone="green">확인 완료</Tag>
                    </div>
                  </div>

                  <div
                    className="card__head"
                    style={{ borderTop: "1px solid var(--border-soft)", borderBottom: "none" }}
                  >
                    <div>
                      <div className="card__title">최근 활동</div>
                      <div className="card__sub">내가 담당하는 항목</div>
                    </div>
                  </div>
                  <div className={styles.cardBodyTight}>
                    {activities.map((act) => (
                      <div key={act.id} className={styles.activity}>
                        <Avatar initials={act.initials} tone={act.tone ?? "default"} size="sm" />
                        <div className="flex-1">
                          <div className={styles.activityBody}>
                            <b>{act.author}</b>
                            {act.body}
                          </div>
                          <div className={styles.activityTime}>
                            {act.context} · {act.time}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
