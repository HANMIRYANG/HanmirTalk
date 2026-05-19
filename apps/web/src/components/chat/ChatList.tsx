"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Room } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Tag";
import { IconButton } from "@/components/ui/IconButton";
import { MuteIcon, PlusIcon } from "@/components/ui/icons";
import { getSocket } from "@/lib/socket";
import { useRouter } from "next/navigation";
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

type Filter = "all" | "unread" | "pinned" | "mention";

export function ChatList({ rooms, activeRoomId, currentUserId }: ChatListProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [newChatOpen, setNewChatOpen] = useState(false);

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
      case "mention":
        // 멘션은 Phase 5에서 messages.entities 도입 시 활성화. 그때까지 빈 목록.
        return [] as Room[];
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
        <button
          type="button"
          onClick={() => setFilter("mention")}
          className={cn(styles.pill, filter === "mention" && styles.pillActive)}
          title="멘션 기능은 추후 도입 예정"
        >
          멘션
        </button>
      </div>

      <div className={styles.scroll}>
        {visible.length === 0 ? (
          <div className={styles.empty}>
            {filter === "mention"
              ? "멘션 기능은 추후 도입 예정입니다."
              : filter === "unread"
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
              />
            ))}

            {others.length > 0 ? <div className={styles.group}>최근 대화</div> : null}
            {others.map((room) => (
              <ChatRow
                key={room.id}
                room={room}
                active={room.id === activeRoomId || pathname === `/chat/${room.id}`}
              />
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

function ChatRow({ room, active }: { room: Room; active?: boolean }) {
  return (
    <Link href={`/chat/${room.id}`} className={cn(styles.row, active && styles.rowActive)}>
      <div className={styles.avatarBlock}>
        <Avatar
          initials={room.avatarLabel ?? room.name.slice(0, 2)}
          tone={room.avatarTone ?? "default"}
          className={styles.rowAvatar}
        />
        {room.presence ? (
          <span
            className={cn(
              styles.presence,
              room.presence === "away" && styles.presenceAway,
              room.presence === "off" && styles.presenceOff
            )}
          />
        ) : null}
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
