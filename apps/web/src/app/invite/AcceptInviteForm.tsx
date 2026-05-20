"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { InvitationPreview } from "@hanmir/shared";
import { userRoleLabel } from "@hanmir/shared";
import { LockIcon, UserIcon } from "@/components/ui/icons";
import { invitationService } from "@/services/invitation.service";
import { ApiError } from "@/services/api-client";
import styles from "../login/login.module.css";

interface Props {
  token: string;
  preview: InvitationPreview;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 410) return "초대 링크가 만료되었습니다.";
    if (err.status === 409) return "이미 사용되었거나 가입된 초대입니다.";
    if (err.status === 404) return "유효하지 않은 초대 링크입니다.";
    if (err.status === 400 && err.message === "password_too_short") {
      return "비밀번호는 8자 이상이어야 합니다.";
    }
    if (err.status === 400) return "입력값을 다시 확인해 주세요.";
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

export function AcceptInviteForm({ token, preview }: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!preview.valid) {
    return (
      <div className={styles.form}>
        <h2>초대 확인 불가</h2>
        <p className={styles.sub}>
          유효하지 않거나 만료된 초대 링크입니다. 관리자에게 새 초대를
          요청해 주세요.
        </p>
        <Link
          href="/login"
          className={`btn btn--primary btn--block ${styles.submit}`}
        >
          로그인 화면으로
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.form}>
        <h2>가입 완료</h2>
        <p className={styles.sub}>
          계정이 생성되었습니다. 설정한 비밀번호로 로그인하세요.
        </p>
        <Link
          href="/login"
          className={`btn btn--primary btn--block ${styles.submit}`}
        >
          로그인하러 가기
        </Link>
      </div>
    );
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!name.trim()) {
      setError("이름을 입력해 주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (password !== confirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setSubmitting(true);
    try {
      await invitationService.acceptInvite({
        token,
        name: name.trim(),
        password
      });
      setDone(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <h2>가입 완료하기</h2>
      <p className={styles.sub}>
        {preview.email} 계정을 만듭니다.
        {preview.role ? ` · ${userRoleLabel[preview.role]}` : ""}
        {preview.departmentName ? ` · ${preview.departmentName}` : ""}
      </p>

      <div className={styles.formGroup}>
        <label className="field-label" htmlFor="invite-name">
          이름
        </label>
        <div className={styles.fieldRow}>
          <span className={styles.fieldIc}>
            <UserIcon size={16} />
          </span>
          <input
            id="invite-name"
            className={`field ${styles.fieldInset}`}
            type="text"
            placeholder="홍길동"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className="field-label" htmlFor="invite-pw">
          비밀번호 (8자 이상)
        </label>
        <div className={styles.fieldRow}>
          <span className={styles.fieldIc}>
            <LockIcon size={16} />
          </span>
          <input
            id="invite-pw"
            className={`field ${styles.fieldInset}`}
            type="password"
            placeholder="비밀번호 입력"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className="field-label" htmlFor="invite-pw2">
          비밀번호 확인
        </label>
        <div className={styles.fieldRow}>
          <span className={styles.fieldIc}>
            <LockIcon size={16} />
          </span>
          <input
            id="invite-pw2"
            className={`field ${styles.fieldInset}`}
            type="password"
            placeholder="비밀번호 다시 입력"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
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
        {submitting ? "처리 중..." : "가입 완료"}
      </button>

      <div className={styles.foot}>
        이미 계정이 있으신가요? <Link href="/login">로그인</Link>
      </div>
    </form>
  );
}
