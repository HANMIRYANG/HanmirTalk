"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LockIcon, UserIcon } from "@/components/ui/icons";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api-client";
import styles from "./login.module.css";

interface LoginFormProps {
  defaultEmail?: string;
}

export function LoginForm({ defaultEmail = "" }: LoginFormProps) {
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
      router.push("/chat");
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
        <a className={styles.link} href="#">
          비밀번호 찾기
        </a>
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
