"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Room } from "@hanmir/shared";
import { IconButton } from "@/components/ui/IconButton";
import { MoreIcon } from "@/components/ui/icons";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import { RoomEditModal } from "./RoomEditModal";
import { AddMemberModal } from "./AddMemberModal";
import styles from "./ChatRoomActions.module.css";

interface Props {
  room: Room;
}

// Phase 4 G-2b — header "더보기" popover. Mute toggle + leave room.
// Direct rooms hide [방 나가기] (cannot_leave_direct_room).
export function ChatRoomActions({ room }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  // Track muted state locally so the menu label flips immediately after
  // a successful toggle without waiting for router.refresh.
  const [muted, setMuted] = useState(!!room.muted);
  const popRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Re-sync the local muted flag if the room prop changes (e.g. another
  // tab muted while this one was open).
  useEffect(() => {
    setMuted(!!room.muted);
  }, [room.muted]);

  const onToggleMute = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = muted
        ? await chatService.unmuteRoom(room.id)
        : await chatService.muteRoom(room.id);
      setMuted(!!updated.muted);
      setOpen(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert("알림 설정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    if (busy) return;
    if (!window.confirm(`'${room.name}' 채팅방에서 나가시겠습니까?`)) return;
    setBusy(true);
    try {
      const result = await chatService.leaveRoom(room.id);
      setOpen(false);
      if (result.archived) {
        // We were the last member; the room is gone.
        router.push("/chat");
      } else {
        router.push("/chat");
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert("방 나가기에 실패했습니다.");
      setBusy(false);
    }
  };

  const canLeave = room.type !== "direct";
  // direct 방은 이름이 상대방 이름으로 표시되고 멤버가 고정(서버 거부)
  // 이라 수정/추가 진입점을 모두 숨긴다.
  const canManageRoom = room.type !== "direct";

  return (
    <div className={styles.wrap} ref={popRef}>
      <IconButton
        aria-label="더보기"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon size={18} />
      </IconButton>
      {open ? (
        <div className={styles.popover} role="menu">
          {canManageRoom ? (
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setOpen(false);
                setEditOpen(true);
              }}
              disabled={busy}
              role="menuitem"
            >
              채팅방 정보 수정
            </button>
          ) : null}
          {canManageRoom ? (
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setOpen(false);
                setAddMemberOpen(true);
              }}
              disabled={busy}
              role="menuitem"
            >
              멤버 추가
            </button>
          ) : null}
          <button
            type="button"
            className={styles.menuItem}
            onClick={onToggleMute}
            disabled={busy}
            role="menuitem"
          >
            {muted ? "알림 켜기" : "알림 음소거"}
          </button>
          {canLeave ? (
            <button
              type="button"
              className={cn(styles.menuItem, styles.menuItemDanger)}
              onClick={onLeave}
              disabled={busy}
              role="menuitem"
            >
              방 나가기
            </button>
          ) : null}
        </div>
      ) : null}
      {editOpen ? <RoomEditModal room={room} onClose={() => setEditOpen(false)} /> : null}
      {addMemberOpen ? (
        <AddMemberModal room={room} onClose={() => setAddMemberOpen(false)} />
      ) : null}
    </div>
  );
}
