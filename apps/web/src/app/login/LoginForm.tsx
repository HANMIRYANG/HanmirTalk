"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LockIcon, UserIcon } from "@/components/ui/icons";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api-client";
import styles from "./login.module.css";

interface LoginFormProps {
  defaultEmail?: string;
  // 로그인 후 복귀 경로 (ERP SSO authorize 복귀용). 같은 오리진 상대경로만
  // 유효 — 절대 URL·"//host"·백슬래시 변형은 모두 무시하고 대시보드로 간다.
  nextPath?: string;
}

// server-auth.ts 의 PUBLIC_API_BASE 와 같은 규칙: 운영 빌드는 "/api/v1"
// (동일 오리진), dev 는 http://localhost:4000/api/v1.
const PUBLIC_API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:4000/api/v1"
).replace(/\/$/, "");

// 서버에 저장되거나 서명된 값이 아닌 쿼리 파라미터이므로 여기서 강하게
// 제한한다: 같은 오리진 상대경로만. /api/* 는 SSO authorize 복귀 경로 —
// dev 처럼 API 가 다른 오리진이면 공개 API 베이스의 오리진으로 rebase 한다
// (경로는 우리가 검증한 상대경로 그대로라 open redirect 불가).
function resolveNextTarget(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/api/")) {
    try {
      const apiOrigin = new URL(PUBLIC_API_BASE).origin;
      return `${apiOrigin}${next}`;
    } catch {
      return next; // 상대 베이스(운영 동일 오리진) — 그대로 사용
    }
  }
  return next;
}

export function LoginForm({ defaultEmail = "", nextPath }: LoginFormProps) {
  const router = useRouter();
  const [idOrEmail, setIdOrEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  // `remember` is kept for UX continuity but no longer changes cookie
  // expiry — the server controls the refresh-token TTL (30d) and the
  // access cookie (15min). A future "remember me" off path would call a
  // dedicated /auth/login?remember=false instead.
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!idOrEmail.trim() || !password) {
      setError("아이디와 비밀번호를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      // Phase 1 D-3 — the server now sets httpOnly `hanmir_token` +
      // `hanmir_refresh` cookies via Set-Cookie. JS no longer touches
      // document.cookie for auth; we just navigate after success.
      await authService.login(idOrEmail.trim(), password);
      // SSO authorize 복귀 등 next 가 있으면 전체 페이지 내비게이션으로
      // 이동한다 — API 엔드포인트의 302 체인과 쿠키 재전송은 라우터
      // 클라이언트 내비게이션으로는 동작하지 않는다.
      const nextTarget = resolveNextTarget(nextPath);
      if (nextTarget) {
        window.location.assign(nextTarget);
        return;
      }
      // 랜딩 = 대시보드 — 채팅 홈은 채팅 전용 패널이라 출근 직후
      // 업무 요약은 대시보드에서 본다.
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("아이디 또는 비밀번호가 올바르지 않습니다.");
      } else {
        setError("로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <h2>로그인</h2>
      <p className={styles.sub}>사내 계정으로 한미르톡에 접속하세요.</p>

      <div className={styles.formGroup}>
        <label className="field-label" htmlFor="login-id">
          사원번호 또는 이메일
        </label>
        <div className={styles.fieldRow}>
          <span className={styles.fieldIc}>
            <UserIcon size={16} />
          </span>
          <input
            id="login-id"
            className={`field ${styles.fieldInset}`}
            type="text"
            placeholder="name@hanmirfe.com"
            value={idOrEmail}
            onChange={(e) => setIdOrEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className="field-label" htmlFor="login-pw">
          비밀번호
        </label>
        <div className={styles.fieldRow}>
          <span className={styles.fieldIc}>
            <LockIcon size={16} />
          </span>
          <input
            id="login-pw"
            className={`field ${styles.fieldInset}`}
            type="password"
            placeholder="비밀번호 입력"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
      </div>

      <div className={styles.formRow}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />{" "}
          로그인 상태 유지
        </label>
        <span
          className={styles.link}
          title="비밀번호를 잊으셨다면 시스템 관리자에게 초기화를 요청하세요."
        >
          비밀번호 분실 시 관리자 문의
        </span>
      </div>

      {error ? (
        <div className={styles.formError} role="alert">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        className={`btn btn--primary btn--block ${styles.submit}`}
        disabled={submitting}
      >
        {submitting ? "로그인 중..." : "로그인"}
      </button>

      <div className={styles.sso}>또는</div>
      <button type="button" className={styles.ssoBtn}>
        <span className={styles.ssoBadge}>✓</span>
        한미르 SSO로 로그인
      </button>

      <div className={styles.foot}>
        © 2026 한미르주식회사 · v2.4.1
        <br />
        문의: 총무IT팀
      </div>
    </form>
  );
}
