"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage } from "@hanmir/shared";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";

// Phase 2 E-1 — 수정/삭제 상태와 핸들러. busy 는 저장과 삭제가 공유한다
// (원래 MessageItem 본체에 있던 단일 busy state 를 그대로 유지).
export function useMessageActions(message: ChatMessage) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setError(null);
    setDraft(message.body);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(message.body);
    setError(null);
  };

  const saveEdit = async () => {
    const next = draft.trim();
    if (!next) {
      setError("내용을 입력해주세요.");
      return;
    }
    if (next === message.body) {
      // No-op edit; just exit edit mode.
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await chatService.updateMessage(message.id, next);
      setEditing(false);
      // Server emits message:updated → other clients refresh via socket.
      // For the actor we still router.refresh() so SSR re-renders with the
      // new body / editedAt without waiting for socket round-trip.
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setError("본인이 작성한 메시지만 수정할 수 있습니다.");
        return;
      }
      setError("저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const onConfirmDelete = async () => {
    if (busy) return;
    if (!window.confirm("이 메시지를 삭제하시겠습니까? (복구 불가)")) return;
    setBusy(true);
    try {
      await chatService.deleteMessage(message.id);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        window.alert("삭제 권한이 없습니다.");
        return;
      }
      window.alert("삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter saves; Esc cancels. Plain Enter inserts a newline
    // (multi-line edits should be easy).
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  return {
    editing,
    draft,
    setDraft,
    busy,
    error,
    startEdit,
    cancelEdit,
    saveEdit,
    onConfirmDelete,
    onKeyDown
  };
}
