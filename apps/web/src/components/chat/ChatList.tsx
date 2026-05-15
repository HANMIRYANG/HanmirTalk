"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Room } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Tag";
import { IconButton } from "@/components/ui/IconButton";
import { MuteIcon, PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import styles from "./ChatList.module.css";

interface ChatListProps {
  rooms: Room[];
  activeRoomId?: string;
}

export function ChatList({ rooms, activeRoomId }: ChatListProps) {
  const pathname = usePathname() ?? "";

  const pinned = rooms.filter((r) => r.pinned);
  const others = rooms.filter((r) => !r.pinned);

  return (
    <aside className={styles.chatlist}>
      <div className={styles.head}>
        <h2>채팅</h2>
        <IconButton aria-label="새 채팅" className={styles.headBtn}>
          <PlusIcon size={18} />
        </IconButton>
      </div>

      <div className={styles.filter}>
        <button className={cn(styles.pill, styles.pillActive)}>
          전체<span className={styles.pillCount}>24</span>
        </button>
        <button className={styles.pill}>
          읽지 않음<span className={styles.pillCount}>12</span>
        </button>
        <button className={styles.pill}>
          고정<span className={styles.pillCount}>3</span>
        </button>
        <button className={styles.pill}>멘션</button>
      </div>

      <div className={styles.scroll}>
        {pinned.length > 0 ? <div className={styles.group}>고정된 대화</div> : null}
        {pinned.map((room) => (
          <ChatRow
            key={room.id}
            room={room}
            active={room.id === activeRoomId || pathname === `/chat/${room.id}`}
          />
        ))}

        <div className={styles.group}>최근 대화</div>
        {others.map((room) => (
          <ChatRow
            key={room.id}
            room={room}
            active={room.id === activeRoomId || pathname === `/chat/${room.id}`}
          />
        ))}
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
