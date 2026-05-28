"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { chatService } from "@/services/chat.service";
import { userService } from "@/services/user.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import styles from "./NewChatModal.module.css";

interface Props {
  currentUserId: string;
  onClose: () => void;
}

type ChatKind = "direct" | "group";

// Phase 4 G-2a — new chat modal. Two flows:
//   direct: pick one other user → POST /rooms/direct (find-or-create)
//   group:  pick ≥2 other users + room name → POST /rooms
// Project rooms aren't created here in the MVP — they're better managed
// from the project detail page when projectId context is known.
export function NewChatModal({ currentUserId, onClose }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<ChatKind>("direct");
  const [users, setUsers] = useState<User[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the user directory once when the modal opens.
  useEffect(() => {
    let cancelled = false;
    userService
      .listUsers()
      .then((list) => {
        if (!cancelled) setUsers(list.filter((u) => u.id !== currentUserId && u.isActive !== false));
      })
      .catch(() => {
        if (!cancelled) setUsersError("사용자 목록을 불러올 수 없습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

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

  // Switching DM → group preserves selections; switching the other way
  // collapses to the most recently selected single user (since DM is 1:1).
  const onKindChange = (next: ChatKind) => {
    setKind(next);
    setError(null);
    if (next === "direct" && selectedIds.length > 1) {
      setSelectedIds(selectedIds.slice(-1));
    }
  };

  const onToggleUser = (userId: string) => {
    if (kind === "direct") {
      setSelectedIds(selectedIds.includes(userId) ? [] : [userId]);
    } else {
      setSelectedIds(
        selectedIds.includes(userId)
          ? selectedIds.filter((id) => id !== userId)
          : [...selectedIds, userId]
      );
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (selectedIds.length === 0) {
      setError("최소 한 명의 사용자를 선택해주세요.");
      return;
    }
    if (kind === "group") {
      if (selectedIds.length < 2) {
        setError("그룹 채팅은 본인 외에 2명 이상 필요합니다.");
        return;
      }
      if (!groupName.trim()) {
        setError("그룹 채팅방 이름을 입력해주세요.");
        return;
      }
    }
    setBusy(true);
    try {
      let room;
      if (kind === "direct") {
        room = await chatService.openDirectMessage(selectedIds[0]);
      } else {
        room = await chatService.createRoom({
          name: groupName.trim(),
          type: "group",
          memberIds: selectedIds
        });
      }
      onClose();
      router.push(`/chat/${room.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError("채팅방 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <form className={styles.modal} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2 className={styles.title}>새 채팅</h2>

        <div className={styles.kindRow}>
          <button
            type="button"
            className={cn(styles.kindBtn, kind === "direct" && styles.kindBtnActive)}
            onClick={() => onKindChange("direct")}
            disabled={busy}
          >
            1:1 대화
          </button>
          <button
            type="button"
            className={cn(styles.kindBtn, kind === "group" && styles.kindBtnActive)}
            onClick={() => onKindChange("group")}
            disabled={busy}
          >
            그룹 채팅
          </button>
        </div>

        {kind === "group" ? (
          <label className={styles.label}>
            채팅방 이름
            <input
              className="field"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="예: 신소재 도입 TFT"
              disabled={busy}
              maxLength={150}
              required
            />
          </label>
        ) : null}

        <label className={styles.label}>
          {kind === "direct" ? "상대 사용자 선택" : "참여 사용자 선택 (2명 이상)"}
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
            <div className={styles.empty}>일치하는 사용자가 없습니다.</div>
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
            {busy ? "생성 중…" : kind === "direct" ? "대화 시작" : "채팅방 만들기"}
          </button>
        </div>
      </form>
    </div>
  );
}
