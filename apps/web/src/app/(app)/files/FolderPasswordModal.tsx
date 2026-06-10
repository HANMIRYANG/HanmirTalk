"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";

interface FolderPasswordModalProps {
  open: boolean;
  folderName: string;
  error?: string | null;
  onClose: () => void;
  onSubmit: (password: string) => void;
}

// 비밀번호 보호 폴더 진입 시 입력 모달. 검증은 서버가 수행하고, 실패 시
// 부모가 error 를 다시 내려보낸다.
export function FolderPasswordModal({
  open,
  folderName,
  error,
  onClose,
  onSubmit
}: FolderPasswordModalProps) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) setPassword("");
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    onSubmit(password);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="비밀번호 보호 폴더"
      description={`"${folderName}" 폴더는 비밀번호가 설정되어 있습니다.`}
      width={380}
    >
      <form onSubmit={submit}>
        <div className={fstyles.formGrid}>
          <label>
            비밀번호
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
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
          <button type="submit" className="btn btn--primary btn--sm" disabled={!password}>
            열기
          </button>
        </div>
      </form>
    </Modal>
  );
}
