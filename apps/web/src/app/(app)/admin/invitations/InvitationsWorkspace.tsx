"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  Department,
  InvitationStatus,
  UserInvitation,
  UserRole
} from "@hanmir/shared";
import { userRoleLabel } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Pagination } from "@/components/ui/Pagination";
import { invitationService } from "@/services/invitation.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "../admin.module.css";
import fstyles from "../admin-forms.module.css";

const ROLE_OPTIONS: UserRole[] = [
  "member",
  "project_owner",
  "manager",
  "admin",
  "super_admin"
];

const PAGE_SIZE = 15;

const STATUS_TONE: Record<InvitationStatus, "blue" | "green" | "amber"> = {
  pending: "blue",
  accepted: "green",
  expired: "amber"
};
const STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: "대기중",
  accepted: "가입 완료",
  expired: "만료"
};

interface Props {
  initialInvitations: UserInvitation[];
  departments: Department[];
}

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.message === "email_already_registered") {
      return "이미 가입된 이메일입니다.";
    }
    if (err.status === 400 && err.message === "email_invalid") {
      return "이메일 형식이 올바르지 않습니다.";
    }
    if (err.status === 400) return `입력값이 올바르지 않습니다 (${err.message}).`;
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function InvitationsWorkspace({ initialInvitations, departments }: Props) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<UserInvitation[]>(initialInvitations);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("member");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(invitations.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged =
    invitations.length > PAGE_SIZE
      ? invitations.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
      : invitations;

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!email.trim() || !departmentId) {
      setError("이메일과 부서는 필수 항목입니다.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await invitationService.createInvitation({
        email: email.trim(),
        role,
        departmentId
      });
      setInvitations((prev) => [created, ...prev]);
      setEmail("");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onCopyUrl = async (invitation: UserInvitation) => {
    const url = `${window.location.origin}/invite?token=${invitation.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(invitation.id);
      window.setTimeout(
        () => setCopiedId((c) => (c === invitation.id ? null : c)),
        1800
      );
    } catch {
      window.prompt("초대 링크 (복사하세요)", url);
    }
  };

  const onRevoke = async (invitation: UserInvitation) => {
    if (busyId) return;
    if (!window.confirm(`'${invitation.email}' 초대를 취소하시겠습니까?`)) return;
    setBusyId(invitation.id);
    setError(null);
    try {
      await invitationService.deleteInvitation(invitation.id);
      setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert(describeError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="col gap-16">
      <section className="card">
        <div className="card__head">
          <h3>초대 발급</h3>
        </div>
        <form onSubmit={onCreate} noValidate style={{ padding: 16 }}>
          <div className={fstyles.formGrid}>
            <label>
              이메일
              <input
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hanmir.co.kr"
                required
              />
            </label>
            <label>
              역할
              <select
                className="field"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {userRoleLabel[r]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              부서
              <select
                className="field"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                required
              >
                <option value="">선택</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? (
            <div className={fstyles.formError} role="alert">
              {error}
            </div>
          ) : null}
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              className="btn btn--primary btn--sm"
              disabled={submitting}
            >
              {submitting ? "발급 중..." : "초대 발급"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card__head">
          <h3>초대 목록</h3>
          <span className="muted t-xs">{invitations.length}건</span>
        </div>
        <table className={styles.utable}>
          <thead>
            <tr>
              <th>이메일</th>
              <th>역할 / 부서</th>
              <th>상태</th>
              <th>만료일</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {paged.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.email}</td>
                <td>
                  {userRoleLabel[inv.role]} / {inv.departmentName ?? "—"}
                </td>
                <td>
                  <Tag tone={STATUS_TONE[inv.status]} dot>
                    {STATUS_LABEL[inv.status]}
                  </Tag>
                </td>
                <td className="muted t-sm">{formatDate(inv.expiresAt)}</td>
                <td>
                  <div className={fstyles.rowActions}>
                    <button
                      type="button"
                      className={fstyles.linkBtn}
                      onClick={() => onCopyUrl(inv)}
                      disabled={inv.status !== "pending"}
                    >
                      {copiedId === inv.id ? "복사됨" : "URL 복사"}
                    </button>
                    <button
                      type="button"
                      className={`${fstyles.linkBtn} ${fstyles.danger}`}
                      onClick={() => onRevoke(inv)}
                      disabled={busyId === inv.id}
                    >
                      {busyId === inv.id ? "처리 중..." : "취소"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {invitations.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  발급된 초대가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
      </section>
    </div>
  );
}
