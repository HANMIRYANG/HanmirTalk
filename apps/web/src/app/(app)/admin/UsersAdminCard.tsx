"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateUserInput,
  Department,
  UpdateUserInput,
  User,
  UserRole
} from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { alertDialog } from "@/components/ui/AppDialogHost";
import { Tag } from "@/components/ui/Tag";
import { SearchIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { userService } from "@/services/user.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "./admin.module.css";
import fstyles from "./admin-forms.module.css";

const ROLE_TONE: Record<UserRole, "blue" | "orange" | "red" | "default"> = {
  super_admin: "red",
  admin: "blue",
  manager: "blue",
  project_owner: "orange",
  member: "default"
};

const ROLE_TEXT: Record<UserRole, string> = {
  super_admin: "슈퍼 관리자",
  admin: "회사 관리자",
  manager: "프로젝트 관리자",
  project_owner: "프로젝트 관리자",
  member: "일반 사용자"
};

const ROLE_OPTIONS: UserRole[] = [
  "member",
  "project_owner",
  "manager",
  "admin",
  "super_admin"
];

const PAGE_SIZE = 15;

const AVATAR_TONES: NonNullable<User["avatarTone"]>[] = [
  "default",
  "orange",
  "green",
  "purple",
  "gray"
];

interface UsersAdminCardProps {
  initialUsers: User[];
  departments: Department[];
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  departmentId: string;
  position: string;
  role: UserRole;
  avatarTone: NonNullable<User["avatarTone"]>;
  initials: string;
}

const EMPTY_FORM = (defaultDept?: string): FormState => ({
  name: "",
  email: "",
  phone: "",
  departmentId: defaultDept ?? "",
  position: "",
  role: "member",
  avatarTone: "default",
  initials: ""
});

function userToForm(user: User): FormState {
  return {
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    departmentId: user.departmentId,
    position: user.position,
    role: user.role,
    avatarTone: (user.avatarTone ?? "default") as NonNullable<User["avatarTone"]>,
    initials: user.initials
  };
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.message === "email_in_use") {
      return "이미 사용 중인 이메일입니다.";
    }
    if (err.status === 400) {
      return `입력값이 올바르지 않습니다 (${err.message}).`;
    }
    if (err.status === 403) {
      return "권한이 없습니다.";
    }
    if (err.status === 0) {
      return "서버에 연결할 수 없습니다.";
    }
  }
  return "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function UsersAdminCard({ initialUsers, departments }: UsersAdminCardProps) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<null | { kind: "create" } | { kind: "edit"; user: User }>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM(departments[0]?.id));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.departmentName.toLowerCase().includes(q)
    );
  }, [users, search]);

  // 검색어가 바뀌면 1페이지로.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged =
    filtered.length > PAGE_SIZE
      ? filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
      : filtered;

  const openCreate = () => {
    setForm(EMPTY_FORM(departments[0]?.id));
    setError(null);
    setMode({ kind: "create" });
  };

  const openEdit = (user: User) => {
    setForm(userToForm(user));
    setError(null);
    setMode({ kind: "edit", user });
  };

  const close = () => {
    if (submitting) return;
    setMode(null);
    setError(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mode) return;
    setError(null);
    if (!form.name.trim() || !form.email.trim() || !form.departmentId || !form.position.trim()) {
      setError("이름·이메일·부서·직책은 필수 항목입니다.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode.kind === "create") {
        const payload: CreateUserInput = {
          name: form.name.trim(),
          email: form.email.trim(),
          departmentId: form.departmentId,
          position: form.position.trim(),
          role: form.role,
          avatarTone: form.avatarTone,
          initials: form.initials.trim() || undefined,
          phone: form.phone.trim() || undefined
        };
        const created = await userService.createUser(payload);
        setUsers((prev) => [...prev, created]);
      } else {
        const payload: UpdateUserInput = {
          name: form.name.trim(),
          email: form.email.trim(),
          departmentId: form.departmentId,
          position: form.position.trim(),
          role: form.role,
          avatarTone: form.avatarTone,
          initials: form.initials.trim() || undefined,
          phone: form.phone.trim() || undefined
        };
        const updated = await userService.updateUser(mode.user.id, payload);
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      }
      setMode(null);
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

  const onDeactivate = async (user: User) => {
    if (busyUserId) return;
    if (user.isActive === false) return;
    setBusyUserId(user.id);
    setError(null);
    try {
      const updated = await userService.deactivateUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      alertDialog(describeError(err));
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <section className="card">
      <div className="card__head">
        <h3>사용자 관리</h3>
        <span className="muted t-xs">{users.length}명</span>
        <div className="right" style={{ display: "flex", gap: 8 }}>
          <div className="search" style={{ width: 200 }}>
            <SearchIcon size={14} />
            <input
              placeholder="이름·이메일·부서 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn--primary btn--sm" type="button" onClick={openCreate}>
            + 사용자 추가
          </button>
        </div>
      </div>
      <table className={styles.utable}>
        <thead>
          <tr>
            <th>사용자</th>
            <th>부서 / 직책</th>
            <th>역할</th>
            <th>상태</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {paged.map((u) => {
            const isInactive = u.isActive === false;
            return (
              <tr key={u.id}>
                <td>
                  <div className={styles.ucell}>
                    <Avatar initials={u.initials} tone={u.avatarTone ?? "default"} />
                    <div>
                      <div className={styles.uname}>
                        {u.name}
                        {isInactive ? <span className={fstyles.inactiveTag}>· 비활성</span> : null}
                      </div>
                      <div className={styles.uemail}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {u.departmentName} / {u.position}
                </td>
                <td>
                  <Tag tone={ROLE_TONE[u.role]}>{ROLE_TEXT[u.role]}</Tag>
                </td>
                <td>
                  {isInactive ? (
                    <Tag tone="amber" dot>
                      비활성
                    </Tag>
                  ) : (
                    <Tag tone="green" dot>
                      활성
                    </Tag>
                  )}
                </td>
                <td>
                  <div className={fstyles.rowActions}>
                    <button
                      type="button"
                      className={fstyles.linkBtn}
                      onClick={() => openEdit(u)}
                      disabled={busyUserId === u.id}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className={`${fstyles.linkBtn} ${fstyles.danger}`}
                      onClick={() => onDeactivate(u)}
                      disabled={isInactive || busyUserId === u.id}
                    >
                      {busyUserId === u.id ? "처리 중..." : "비활성화"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>
                일치하는 사용자가 없습니다.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />

      <Modal
        open={!!mode}
        onClose={close}
        title={mode?.kind === "edit" ? "사용자 정보 수정" : "사용자 추가"}
        description={
          mode?.kind === "edit"
            ? `${mode.user.name} (${mode.user.email})`
            : "초기 비밀번호는 dev 공용 비밀번호가 적용됩니다."
        }
        width={520}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={close}
              disabled={submitting}
            >
              취소
            </button>
            <button
              type="submit"
              form="admin-user-form"
              className="btn btn--primary btn--sm"
              disabled={submitting}
            >
              {submitting ? "저장 중..." : mode?.kind === "edit" ? "저장" : "추가"}
            </button>
          </>
        }
      >
        <form id="admin-user-form" onSubmit={onSubmit} noValidate>
          <div className={fstyles.formGrid}>
            <label>
              이름
              <input
                className="field"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label>
              이메일
              <input
                className="field"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </label>
            <label>
              부서
              <select
                className="field"
                value={form.departmentId}
                onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
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
            <label>
              직책
              <input
                className="field"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                required
              />
            </label>
            <label>
              역할
              <select
                className="field"
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value as UserRole }))
                }
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_TEXT[r]} ({r})
                  </option>
                ))}
              </select>
            </label>
            <label>
              아바타 색상
              <select
                className="field"
                value={form.avatarTone}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    avatarTone: e.target.value as NonNullable<User["avatarTone"]>
                  }))
                }
              >
                {AVATAR_TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              이니셜
              <input
                className="field"
                placeholder="비워두면 이름 앞 2자 사용"
                value={form.initials}
                onChange={(e) => setForm((f) => ({ ...f, initials: e.target.value }))}
                maxLength={6}
              />
            </label>
            <label>
              연락처
              <input
                className="field"
                placeholder="010-1234-5678"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
          </div>
          {error ? (
            <div className={fstyles.formError} role="alert">
              {error}
            </div>
          ) : null}
        </form>
      </Modal>
    </section>
  );
}
