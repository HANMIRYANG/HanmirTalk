"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CreateNoticeInput } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { noticeService } from "@/services/notice.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import fstyles from "@/app/(app)/admin/admin-forms.module.css";

interface NoticeCreateButtonProps {
  label?: string;
  className?: string;
}

interface FormState {
  title: string;
  body: string;
  isMandatory: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  body: "",
  isMandatory: true
};

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "공지 작성 권한이 없습니다.";
    if (err.status === 400) return `입력값이 올바르지 않습니다 (${err.message}).`;
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function NoticeCreateButton({
  label = "+ 공지 작성",
  className = "btn btn--primary btn--sm"
}: NoticeCreateButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setError(null);
    }
  }, [open]);

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || !body) {
      setError("제목과 본문은 필수 항목입니다.");
      return;
    }

    const payload: CreateNoticeInput = {
      title,
      body,
      isMandatory: form.isMandatory
    };

    setSubmitting(true);
    try {
      await noticeService.createNotice(payload);
      setOpen(false);
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

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal
        open={open}
        onClose={close}
        title="공지 작성"
        description="작성 즉시 모든 활성 사용자에게 노출됩니다."
        width={560}
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
              form="notice-create-form"
              className="btn btn--primary btn--sm"
              disabled={submitting}
            >
              {submitting ? "등록 중..." : "등록"}
            </button>
          </>
        }
      >
        <form id="notice-create-form" onSubmit={onSubmit} noValidate>
          <div className={fstyles.formGrid}>
            <label className={fstyles.span2}>
              제목
              <input
                className="field"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={200}
                required
                autoFocus
              />
            </label>
            <label className={fstyles.span2}>
              본문
              <textarea
                className="field"
                rows={6}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                maxLength={5000}
                required
              />
            </label>
            <label
              className={fstyles.span2}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <input
                type="checkbox"
                checked={form.isMandatory}
                onChange={(e) => setForm((f) => ({ ...f, isMandatory: e.target.checked }))}
              />
              <span>필독 공지로 등록 (모든 직원이 확인 처리해야 함)</span>
            </label>
          </div>
          {error ? (
            <div className={fstyles.formError} role="alert">
              {error}
            </div>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
