"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Room } from "@hanmir/shared";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "./NewChatModal.module.css";

interface Props {
  room: Room;
  onClose: () => void;
}

// 채팅방 이름/설명 수정 모달. 서버 PATCH /rooms/:id 는 방 멤버 누구나
// 호출 가능 (direct 방은 진입점 자체를 숨김 — 이름이 상대방 이름으로
// 표시되는 방이라 수정이 무의미).
export function RoomEditModal({ room, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!name.trim()) {
      setError("채팅방 이름을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      await chatService.updateRoom(room.id, {
        name: name.trim(),
        description: description.trim()
      });
      onClose();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError("채팅방 정보 수정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <form className={styles.modal} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2 className={styles.title}>채팅방 정보 수정</h2>

        <label className={styles.label}>
          채팅방 이름
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            maxLength={150}
            autoFocus
            required
          />
        </label>

        <label className={styles.label}>
          설명 (선택)
          <input
            className="field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="채팅방 용도를 간단히 적어주세요"
            disabled={busy}
            maxLength={500}
          />
        </label>

        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
            disabled={busy}
          >
            취소
          </button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
