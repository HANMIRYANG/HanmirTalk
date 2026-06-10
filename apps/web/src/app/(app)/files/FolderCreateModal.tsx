"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { FileFolder, User } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { fileService } from "@/services/file.service";
import { ApiError } from "@/services/api-client";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";

interface FolderCreateModalProps {
  open: boolean;
  onClose: () => void;
  // 없으면 최상위(부서) 폴더 생성 — admin 전용 (참여자 선택 노출).
  // 있으면 하위 폴더 생성 (비밀번호 옵션 노출).
  parentId?: string;
  parentName?: string;
  users: User[];
  onCreated: (folder: FileFolder) => void;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "폴더를 만들 권한이 없습니다.";
    if (err.message === "password_too_short") return "비밀번호는 4자 이상이어야 합니다.";
    if (err.message === "name_required") return "폴더 이름을 입력해 주세요.";
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "폴더 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function FolderCreateModal({
  open,
  onClose,
  parentId,
  parentName,
  users,
  onCreated
}: FolderCreateModalProps) {
  const isRoot = !parentId;
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setPassword("");
      setUsePassword(false);
      setMemberIds(new Set());
      setError(null);
    }
  }, [open]);

  const toggleMember = (id: string) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("폴더 이름을 입력해 주세요.");
      return;
    }
    if (!isRoot && usePassword && password.length < 4) {
      setError("비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await fileService.createFolder({
        name: trimmed,
        parentId,
        password: !isRoot && usePassword && password ? password : undefined,
        memberIds: isRoot ? Array.from(memberIds) : undefined
      });
      onCreated(created);
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isRoot ? "새 부서 폴더" : "새 폴더"}
      description={
        isRoot
          ? "최상위 폴더는 관리자만 만들 수 있습니다. 참여자는 이 폴더 안에 하위 폴더를 만들 수 있습니다."
          : `${parentName ?? "상위 폴더"} 안에 폴더를 만듭니다.`
      }
      width={460}
    >
      <form onSubmit={submit}>
        <div className={fstyles.formGrid}>
          <label>
            폴더 이름
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isRoot ? "예: 경영지원실" : "예: 2026 결산자료"}
              maxLength={100}
              autoFocus
            />
          </label>
          {!isRoot ? (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={usePassword}
                  onChange={(e) => setUsePassword(e.target.checked)}
                />
                비밀번호 설정 (선택)
              </label>
              {usePassword ? (
                <label>
                  비밀번호
                  <input
                    className="field"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="4자 이상"
                    minLength={4}
                  />
                </label>
              ) : null}
            </>
          ) : (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                참여자 ({memberIds.size}명 선택)
              </div>
              <div
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 8,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 4
                }}
              >
                {users
                  .filter((u) => u.isActive !== false)
                  .map((u) => (
                    <label
                      key={u.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12.5
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={memberIds.has(u.id)}
                        onChange={() => toggleMember(u.id)}
                      />
                      {u.name}
                      <span className="muted t-xs">{u.departmentName}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </div>
        {error ? (
          <div className={fstyles.formError} role="alert">
            {error}
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" className="btn btn--outline btn--sm" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={submitting}>
            {submitting ? "생성 중..." : "폴더 만들기"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
