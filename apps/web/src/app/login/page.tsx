import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

// `next`: 로그인 후 복귀 경로. 현재 유일한 생산자는 ERP SSO authorize
// (GET /api/v1/auth/sso/authorize) 의 /login 리다이렉트다. 상대경로만
// 허용하는 검증은 LoginForm 쪽에서 수행한다.
export default function LoginPage({
  searchParams
}: {
  searchParams?: { next?: string };
}) {
  return (
    <div className={styles.shellWrap}>
      <div className={styles.shell}>
        <section className={styles.aside}>
          <div className={styles.logo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/hanmir-logo.png" alt="한미르 로고" />
            <div>
              <div className={styles.logoTitle}>한미르톡</div>
              <div className={styles.logoSub}>한미르주식회사 · 사내 협업 플랫폼</div>
            </div>
          </div>

          <div className={styles.head}>
            업무가 흐르는 곳,
            <br />
            <em>한미르톡</em>에 오신 것을
            <br />
            환영합니다.
          </div>
          <div className={styles.body}>
            프로젝트, 업무, 공지, 제품정보를 한 곳에서 관리하는
            <br />
            한미르 임직원 전용 업무 메신저입니다.
          </div>

          <div className={styles.features}>
            <div className={styles.feat}>
              <span className={styles.featBullet} />
              <span>채팅 · 프로젝트룸 · 간트일정 통합 관리</span>
            </div>
            <div className={`${styles.feat} ${styles.featOrange}`}>
              <span className={styles.featBullet} />
              <span>제품 영업 가능 상태 · 시험성적서 공유</span>
            </div>
            <div className={styles.feat}>
              <span className={styles.featBullet} />
              <span>업무 마감일 · 진행률 자동 집계</span>
            </div>
            <div className={`${styles.feat} ${styles.featOrange}`}>
              <span className={styles.featBullet} />
              <span>PC · 모바일 PWA 동시 지원</span>
            </div>
          </div>
        </section>

        <LoginForm
          nextPath={typeof searchParams?.next === "string" ? searchParams.next : undefined}
        />
      </div>
    </div>
  );
}
