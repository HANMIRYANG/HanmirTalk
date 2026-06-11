"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Tag";
import { IconButton } from "@/components/ui/IconButton";
import { MuteIcon, PlusIcon } from "@/components/ui/icons";
import { getSocket } from "@/lib/socket";
import { useRouter } from "next/navigation";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import { NewChatModal } from "./NewChatModal";
import styles from "./ChatList.module.css";

interface ChatListProps {
  rooms: Room[];
  activeRoomId?: string;
  // Phase 4 G-2 — required for new-chat modal (filter self out of the
  // user picker, become DM counterparty correctly).
  currentUserId: string;
}

type Filter = "all" | "unread" | "pinned";

interface CtxMenuState {
  room: Room;
  x: number;
  y: number;
}

export function ChatList({ rooms, activeRoomId, currentUserId }: ChatListProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [newChatOpen, setNewChatOpen] = useState(false);
  // 방 행 우클릭 컨텍스트 메뉴 (알림/고정/나가기). 모바일은 우클릭이
  // 없으므로 방 내부 [더보기] 메뉴가 같은 기능을 제공한다.
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);

  const openCtxMenu = (room: Room, e: React.MouseEvent) => {
    e.preventDefault();
    // 메뉴가 화면 하단/우측을 벗어나지 않게 클램프.
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 150);
    setCtxMenu({ room, x, y });
  };

  // Phase 4 G-1 — refresh the list when the user gets added to a new
  // room (room:created), an existing room mutates (room:updated), or
  // they leave one (room:membership). The server emits these to the
  // user-scoped channel so every tab updates.
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => router.refresh();
    socket.on("room:created", refresh);
    socket.on("room:updated", refresh);
    socket.on("room:membership", refresh);
    return () => {
      socket.off("room:created", refresh);
      socket.off("room:updated", refresh);
      socket.off("room:membership", refresh);
    };
  }, [router]);

  const counts = useMemo(
    () => ({
      all: rooms.length,
      unread: rooms.filter((r) => r.unread > 0).length,
      pinned: rooms.filter((r) => r.pinned).length
    }),
    [rooms]
  );

  const visible = useMemo(() => {
    switch (filter) {
      case "unread":
        return rooms.filter((r) => r.unread > 0);
      case "pinned":
        return rooms.filter((r) => r.pinned);
      default:
        return rooms;
    }
  }, [rooms, filter]);

  const pinned = visible.filter((r) => r.pinned);
  const others = visible.filter((r) => !r.pinned);

  return (
    <aside className={styles.chatlist}>
      <div className={styles.head}>
        <h2>채팅</h2>
        <IconButton
          aria-label="새 채팅"
          className={styles.headBtn}
          onClick={() => setNewChatOpen(true)}
        >
          <PlusIcon size={18} />
        </IconButton>
      </div>
      {newChatOpen ? (
        <NewChatModal
          currentUserId={currentUserId}
          onClose={() => setNewChatOpen(false)}
        />
      ) : null}

      <div className={styles.filter}>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(styles.pill, filter === "all" && styles.pillActive)}
        >
          전체<span className={styles.pillCount}>{counts.all}</span>
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={cn(styles.pill, filter === "unread" && styles.pillActive)}
        >
          읽지 않음<span className={styles.pillCount}>{counts.unread}</span>
        </button>
        <button
          type="button"
          onClick={() => setFilter("pinned")}
          className={cn(styles.pill, filter === "pinned" && styles.pillActive)}
        >
          고정<span className={styles.pillCount}>{counts.pinned}</span>
        </button>
      </div>

      <div className={styles.scroll}>
        {visible.length === 0 ? (
          <div className={styles.empty}>
            {filter === "unread"
              ? "안 읽은 대화가 없습니다."
              : filter === "pinned"
              ? "고정된 대화가 없습니다."
              : "대화가 없습니다."}
          </div>
        ) : (
          <>
            {pinned.length > 0 ? (
              <div className={styles.group}>고정된 대화</div>
            ) : null}
            {pinned.map((room) => (
              <ChatRow
                key={room.id}
                room={room}
                active={room.id === activeRoomId || pathname === `/chat/${room.id}`}
                onContextMenu={openCtxMenu}
              />
            ))}

            {others.length > 0 ? <div className={styles.group}>최근 대화</div> : null}
            {others.map((room) => (
              <ChatRow
                key={room.id}
                room={room}
                active={room.id === activeRoomId || pathname === `/chat/${room.id}`}
                onContextMenu={openCtxMenu}
              />
            ))}
          </>
        )}
      </div>

      {ctxMenu ? (
        <RoomContextMenu
          state={ctxMenu}
          isActiveRoom={
            ctxMenu.room.id === activeRoomId ||
            pathname === `/chat/${ctxMenu.room.id}`
          }
          onClose={() => setCtxMenu(null)}
        />
      ) : null}
    </aside>
  );
}

function RoomContextMenu({
  state,
  isActiveRoom,
  onClose
}: {
  state: CtxMenuState;
  isActiveRoom: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { room } = state;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const run = async (action: () => Promise<unknown>, failMessage: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onClose();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert(failMessage);
      setBusy(false);
    }
  };

  const onToggleMute = () =>
    run(
      () =>
        room.muted
          ? chatService.unmuteRoom(room.id)
          : chatService.muteRoom(room.id),
      "알림 설정에 실패했습니다."
    );

  const onTogglePin = () =>
    run(
      () =>
        room.pinned
          ? chatService.unfavoriteRoom(room.id)
          : chatService.favoriteRoom(room.id),
      "고정 변경에 실패했습니다."
    );

  const onLeave = () => {
    if (!window.confirm(`'${room.name}' 채팅방에서 나가시겠습니까?`)) return;
    void run(async () => {
      await chatService.leaveRoom(room.id);
      // 보고 있던 방에서 나갔으면 목록으로 이동.
      if (isActiveRoom) router.push("/chat");
    }, "방 나가기에 실패했습니다.");
  };

  return (
    <div
      ref={menuRef}
      className={styles.ctxMenu}
      style={{ left: state.x, top: state.y }}
      role="menu"
    >
      <button
        type="button"
        className={styles.ctxItem}
        onClick={onToggleMute}
        disabled={busy}
        role="menuitem"
      >
        {room.muted ? "알림 켜기" : "알림 끄기"}
      </button>
      <button
        type="button"
        className={styles.ctxItem}
        onClick={onTogglePin}
        disabled={busy}
        role="menuitem"
      >
        {room.pinned ? "고정 해제" : "고정"}
      </button>
      {room.type !== "direct" ? (
        <button
          type="button"
          className={cn(styles.ctxItem, styles.ctxItemDanger)}
          onClick={onLeave}
          disabled={busy}
          role="menuitem"
        >
          방 나가기
        </button>
      ) : null}
    </div>
  );
}

function ChatRow({
  room,
  active,
  onContextMenu
}: {
  room: Room;
  active?: boolean;
  onContextMenu?: (room: Room, e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={`/chat/${room.id}`}
      className={cn(styles.row, active && styles.rowActive)}
      onContextMenu={onContextMenu ? (e) => onContextMenu(room, e) : undefined}
    >
      <div className={styles.avatarBlock}>
        <Avatar
          initials={room.avatarLabel ?? room.name.slice(0, 2)}
          tone={room.avatarTone ?? "default"}
          className={styles.rowAvatar}
        />
      </div>
      <div className={styles.main}>
        <div className={styles.name}>
          <span className={styles.nameText}>{room.name}</span>
          {room.tag ? (
            <Tag tone={room.tag.tone ?? "default"} className={styles.nameTag}>
              {room.tag.label}
            </Tag>
          ) : null}
        </div>
        <div className={styles.msg}>
          {room.lastMessageAuthor ? <b>{room.lastMessageAuthor}: </b> : null}
          {room.lastMessagePreview}
        </div>
      </div>
      <div className={styles.meta}>
        <div className={styles.time}>{room.lastMessageAt}</div>
        {room.unread > 0 ? (
          <div className={cn(styles.badge, room.muted && styles.badgeMuted)}>{room.unread}</div>
        ) : room.muted ? (
          <span className={styles.muteIc}>
            <MuteIcon size={14} />
          </span>
        ) : null}
      </div>
    </Link>
  );
}
