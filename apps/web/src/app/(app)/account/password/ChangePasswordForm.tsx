"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";
import styles from "./password.module.css";

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 && err.message === "invalid_current_password")
      return "현재 비밀번호가 일치하지 않습니다.";
    if (err.status === 400 && err.message === "password_too_short")
      return "새 비밀번호는 8자 이상이어야 합니다.";
    if (err.status === 400 && err.message === "password_unchanged")
      return "새 비밀번호는 현재 비밀번호와 달라야 합니다.";
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "변경에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (next.length < 8) {
      setError("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (next !== confirm) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    try {
      await authService.changePassword(current, next);
      // Successful change → go home. router.refresh so layout re-reads `me`
      // and drops the must-change gate.
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && err.message !== "invalid_current_password") {
        handleSessionExpired(router);
        return;
      }
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
      {forced ? (
        <div className={styles.notice}>
          관리자가 발급한 임시 비밀번호를 사용 중입니다. 새 비밀번호로 변경해 주세요.
        </div>
      ) : null}
      <label className={styles.label}>
        현재 비밀번호
        <input
          className="field"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <label className={styles.label}>
        새 비밀번호 (8자 이상)
        <input
          className="field"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
        />
      </label>
      <label className={styles.label}>
        새 비밀번호 확인
        <input
          className="field"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </label>
      {error ? (
        <div className={fstyles.formError} role="alert">
          {error}
        </div>
      ) : null}
      <div className={styles.actions}>
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
          {busy ? "변경 중..." : "변경"}
        </button>
      </div>
    </form>
  );
}
