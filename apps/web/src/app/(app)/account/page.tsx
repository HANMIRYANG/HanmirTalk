import Link from "next/link";
import { userRoleLabel } from "@hanmir/shared";
import { Topbar } from "@/components/shell/Topbar";
import { Avatar } from "@/components/ui/Avatar";
import { requireServerMe } from "@/lib/server-auth";
import styles from "./account.module.css";

// 설정 허브 — 사이드바 [설정] 과 Topbar 계정 메뉴의 진입점.
// 내 정보 요약 + 개별 설정 페이지(비밀번호/알림) 링크.
export default async function AccountPage() {
  const { me } = await requireServerMe();

  return (
    <>
      <Topbar title="설정" sub="계정 정보와 알림 설정을 관리합니다" />
      <div className="content">
        <div className={styles.grid}>
          <section className="card">
            <div className="card__head">
              <h3>내 정보</h3>
            </div>
            <div className={styles.profile}>
              <Avatar
                initials={me.initials}
                tone={me.avatarTone ?? "default"}
                size="lg"
              />
              <div>
                <div className={styles.profileName}>{me.name}</div>
                <div className={styles.profileMeta}>{me.email}</div>
              </div>
            </div>
            <dl className={styles.infoList}>
              <div className={styles.infoRow}>
                <dt>부서</dt>
                <dd>{me.departmentName ?? "—"}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt>직급</dt>
                <dd>{me.position ?? "—"}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt>권한</dt>
                <dd>{userRoleLabel[me.role]}</dd>
              </div>
            </dl>
            <p className={styles.hint}>
              이름·부서·직급 변경은 관리자에게 요청해주세요.
            </p>
          </section>

          <section className="card">
            <div className="card__head">
              <h3>설정</h3>
            </div>
            <div className={styles.linkList}>
              <Link href="/account/password" className={styles.linkRow}>
                <div>
                  <div className={styles.linkTitle}>비밀번호 변경</div>
                  <div className={styles.linkDesc}>
                    로그인 비밀번호를 변경합니다.
                  </div>
                </div>
                <span className={styles.linkArrow}>→</span>
              </Link>
              <Link href="/account/notifications" className={styles.linkRow}>
                <div>
                  <div className={styles.linkTitle}>알림 설정</div>
                  <div className={styles.linkDesc}>
                    카테고리별 알림 수신 여부와 웹 푸시를 관리합니다.
                  </div>
                </div>
                <span className={styles.linkArrow}>→</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
