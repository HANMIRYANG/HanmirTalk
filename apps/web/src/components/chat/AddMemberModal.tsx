"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Room, User } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { chatService } from "@/services/chat.service";
import { userService } from "@/services/user.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import styles from "./NewChatModal.module.css";

interface Props {
  room: Room;
  onClose: () => void;
}

// 기존 채팅방에 멤버 추가. 서버 POST /rooms/:roomId/members 는 멤버
// 누구나 호출 가능하나 한 번에 한 명만 받으므로 선택 인원만큼 순차
// 호출한다. direct 방은 서버가 거부 — 진입점에서 숨김.
export function AddMemberModal({ room, onClose }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState<User[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 사용자 목록에서 이미 멤버인 사람과 비활성 계정은 제외.
  useEffect(() => {
    const memberIds = new Set(room.members.map((m) => m.userId));
    let cancelled = false;
    userService
      .listUsers()
      .then((list) => {
        if (!cancelled) {
          setUsers(list.filter((u) => !memberIds.has(u.id) && u.isActive !== false));
        }
      })
      .catch(() => {
        if (!cancelled) setUsersError("사용자 목록을 불러올 수 없습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [room.members]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.departmentName.toLowerCase().includes(q)
    );
  }, [users, query]);

  const onToggleUser = (userId: string) => {
    setSelectedIds(
      selectedIds.includes(userId)
        ? selectedIds.filter((id) => id !== userId)
        : [...selectedIds, userId]
    );
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (selectedIds.length === 0) {
      setError("추가할 사용자를 선택해주세요.");
      return;
    }
    setBusy(true);
    try {
      for (const userId of selectedIds) {
        await chatService.addMember(room.id, userId);
      }
      onClose();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError("멤버 추가에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <form className={styles.modal} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2 className={styles.title}>멤버 추가</h2>

        <label className={styles.label}>
          추가할 사용자 선택
          <input
            className="field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름, 이메일, 부서로 검색"
            disabled={busy}
            autoFocus
          />
        </label>

        <div className={styles.userList}>
          {usersError ? (
            <div className={styles.error}>{usersError}</div>
          ) : users === null ? (
            <div className={styles.empty}>사용자 목록을 불러오는 중…</div>
          ) : filteredUsers.length === 0 ? (
            <div className={styles.empty}>추가할 수 있는 사용자가 없습니다.</div>
          ) : (
            filteredUsers.map((u) => {
              const selected = selectedIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  className={cn(styles.userRow, selected && styles.userRowSelected)}
                  onClick={() => onToggleUser(u.id)}
                  disabled={busy}
                >
                  <Avatar initials={u.initials} tone={u.avatarTone ?? "default"} size="sm" />
                  <div className={styles.userMeta}>
                    <div className={styles.userName}>{u.name}</div>
                    <div className={styles.userSub}>
                      {u.departmentName} · {u.position}
                    </div>
                  </div>
                  {selected ? <span className={styles.checkMark}>✓</span> : null}
                </button>
              );
            })
          )}
        </div>

        {selectedIds.length > 0 ? (
          <div className={styles.selectedSummary}>
            선택됨: <b>{selectedIds.length}명</b>
          </div>
        ) : null}

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
            {busy ? "추가 중…" : "멤버 추가"}
          </button>
        </div>
      </form>
    </div>
  );
}
