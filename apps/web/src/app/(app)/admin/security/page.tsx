import type { ReactNode } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { requireServerMe } from "@/lib/server-auth";
import { systemService } from "@/services/system.service";
import { cn } from "@/lib/classNames";
import styles from "../admin.module.css";

// Phase 8 K-3 — 보안 / 로그인 정책. 읽기 전용 — 값 변경은 .env / 코드.
function StatRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-soft)"
      }}
    >
      <span className="muted t-sm">{label}</span>
      <span className="t-sm" style={{ fontWeight: 500, textAlign: "right" }}>
        {children}
      </span>
    </div>
  );
}

function YesTag({ on, onText = "적용", offText = "미적용" }: {
  on: boolean;
  onText?: string;
  offText?: string;
}) {
  return (
    <Tag tone={on ? "green" : "default"} dot>
      {on ? onText : offText}
    </Tag>
  );
}

export default async function AdminSecurityPage() {
  const { token } = await requireServerMe();
  const policy = await systemService.getSecurityPolicy({ token }).catch(() => null);

  return (
    <>
      <Topbar title="보안 / 로그인" sub="인증 · 세션 · 업로드 정책" />

      <section className={styles.ahead}>
        <h1>보안 / 로그인 정책</h1>
        <div className={styles.aheadSub}>
          현재 적용 중인 보안 정책입니다. 값 변경은 환경변수(.env) 또는 서버
          코드에서 이뤄집니다.
        </div>
      </section>

      <div className={cn("content", styles.content)}>
        {policy ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 14
            }}
          >
            <section className="card">
              <div className="card__head">
                <h3>인증 · 비밀번호</h3>
              </div>
              <div>
                <StatRow label="비밀번호 최소 길이">
                  {policy.passwordMinLength}자
                </StatRow>
                <StatRow label="비밀번호 해시">
                  {policy.passwordHash}
                </StatRow>
                <StatRow label="첫 로그인 시 변경 강제">
                  <YesTag on={policy.forcePasswordChangeOnFirstLogin} />
                </StatRow>
                <StatRow label="감사 로그 기록">
                  <YesTag on={policy.auditLogging} />
                </StatRow>
              </div>
            </section>

            <section className="card">
              <div className="card__head">
                <h3>세션 · 토큰</h3>
              </div>
              <div>
                <StatRow label="액세스 토큰 유효시간">
                  {policy.accessTokenTtlMinutes}분
                </StatRow>
                <StatRow label="리프레시 토큰 유효기간">
                  {policy.refreshTokenTtlDays}일
                </StatRow>
                <StatRow label="리프레시 토큰 회전">
                  <YesTag on={policy.refreshTokenRotation} />
                </StatRow>
                <StatRow label="쿠키 HttpOnly">
                  <YesTag on={policy.cookieHttpOnly} />
                </StatRow>
                <StatRow label="쿠키 SameSite">
                  {policy.cookieSameSite}
                </StatRow>
                <StatRow label="쿠키 Secure (HTTPS)">
                  <YesTag
                    on={policy.cookieSecure}
                    offText="미적용 (HTTP 개발)"
                  />
                </StatRow>
              </div>
            </section>

            <section className="card">
              <div className="card__head">
                <h3>파일 · 메일</h3>
              </div>
              <div>
                <StatRow label="파일 업로드 최대 크기">
                  {policy.uploadMaxMb}MB
                </StatRow>
                <StatRow label="SMTP 발송">
                  <YesTag on={policy.smtpEnabled} onText="활성" offText="비활성" />
                </StatRow>
              </div>
            </section>
          </div>
        ) : (
          <section className="card">
            <div className="muted t-sm" style={{ padding: 16 }}>
              보안 정책 정보를 불러오지 못했습니다.
            </div>
          </section>
        )}
      </div>
    </>
  );
}
