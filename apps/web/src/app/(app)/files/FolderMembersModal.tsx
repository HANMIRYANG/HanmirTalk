"use client";

import { useEffect, useState } from "react";
import type { FileFolder, User } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { fileService } from "@/services/file.service";
import { ApiError } from "@/services/api-client";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";

interface FolderMembersModalProps {
  open: boolean;
  folder: FileFolder | null;
  users: User[];
  onClose: () => void;
  onUpdated: (folder: FileFolder) => void;
}

// 최상위(부서) 폴더 참여자 관리 — admin 전용 진입.
export function FolderMembersModal({
  open,
  folder,
  users,
  onClose,
  onUpdated
}: FolderMembersModalProps) {
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && folder) {
      setMemberIds(new Set(folder.memberIds));
      setError(null);
    }
  }, [open, folder]);

  if (!folder) return null;

  const toggle = (id: string) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await fileService.updateFolder(folder.id, {
        memberIds: Array.from(memberIds)
      });
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "참여자를 수정할 권한이 없습니다."
          : "저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`참여자 관리 — ${folder.name}`}
      description="참여자는 이 폴더 안에 하위 폴더를 만들고 파일을 올릴 수 있습니다."
      width={460}
    >
      <div
        style={{
          maxHeight: 260,
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
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}
            >
              <input
                type="checkbox"
                checked={memberIds.has(u.id)}
                onChange={() => toggle(u.id)}
              />
              {u.name}
              <span className="muted t-xs">{u.departmentName}</span>
            </label>
          ))}
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
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={save}
          disabled={submitting}
        >
          {submitting ? "저장 중..." : `저장 (${memberIds.size}명)`}
        </button>
      </div>
    </Modal>
  );
}
