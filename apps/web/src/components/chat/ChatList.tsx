"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Tag";
import { IconButton } from "@/components/ui/IconButton";
import { Pagination } from "@/components/ui/Pagination";
import { MicIcon, MuteIcon, PlusIcon } from "@/components/ui/icons";
import {
  useMeetingRecorder,
  useMeetingRecorderActions
} from "@/components/meeting/MeetingRecorderProvider";
import { getSocket } from "@/lib/socket";
import { useRouter } from "next/navigation";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { confirmDialog, alertDialog } from "@/components/ui/AppDialogHost";
import { cn } from "@/lib/classNames";
import { NewChatModal } from "./NewChatModal";
import styles from "./ChatList.module.css";

interface ChatListProps {
  rooms: Room[];
  activeRoomId?: string;
  // Phase 4 G-2 — required for new-chat modal (filter self out of the
  // user picker, become DM counterparty correctly).
  currentUserId: string;
  // 관리자 전용 참여/미참여 필터 노출 여부 — 서버가 관리자에게만 비멤버
  // 방을 내려주므로 UI 게이트일 뿐 권한 경계는 서버에 있다.
  isAdmin?: boolean;
}

type Filter = "all" | "unread" | "pinned" | "member" | "nonmember";

// 목록이 무한정 길어지지 않도록 페이지당 12개.
const ROOMS_PER_PAGE = 12;

interface CtxMenuState {
  room: Room;
  x: number;
  y: number;
}

export function ChatList({
  rooms,
  activeRoomId,
  currentUserId,
  isAdmin = false
}: ChatListProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
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

  const isMemberOf = useCallback(
    (r: Room) => r.members.some((m) => m.userId === currentUserId),
    [currentUserId]
  );

  const counts = useMemo(
    () => ({
      all: rooms.length,
      unread: rooms.filter((r) => r.unread > 0).length,
      pinned: rooms.filter((r) => r.pinned).length,
      member: rooms.filter(isMemberOf).length,
      nonmember: rooms.filter((r) => !isMemberOf(r)).length
    }),
    [rooms, isMemberOf]
  );

  const visible = useMemo(() => {
    switch (filter) {
      case "unread":
        return rooms.filter((r) => r.unread > 0);
      case "pinned":
        return rooms.filter((r) => r.pinned);
      // 관리자 전용 — 내가 멤버인 방 / 열람만 가능한 비멤버 방 분리.
      case "member":
        return rooms.filter(isMemberOf);
      case "nonmember":
        return rooms.filter((r) => !isMemberOf(r));
      default:
        return rooms;
    }
  }, [rooms, filter, isMemberOf]);

  // 고정 방 먼저 → 최근 대화. 이 순서 그대로 12개씩 잘라 페이지네이션
  // 하고, 각 페이지 안에서 그룹 헤더를 다시 계산한다.
  const ordered = useMemo(() => {
    const pinnedRooms = visible.filter((r) => r.pinned);
    const otherRooms = visible.filter((r) => !r.pinned);
    return [...pinnedRooms, ...otherRooms];
  }, [visible]);

  const pageCount = Math.max(1, Math.ceil(ordered.length / ROOMS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pageRooms = ordered.slice(
    (safePage - 1) * ROOMS_PER_PAGE,
    safePage * ROOMS_PER_PAGE
  );
  const pinned = pageRooms.filter((r) => r.pinned);
  const others = pageRooms.filter((r) => !r.pinned);

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

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
          onClick={() => changeFilter("all")}
          className={cn(styles.pill, filter === "all" && styles.pillActive)}
        >
          전체<span className={styles.pillCount}>{counts.all}</span>
        </button>
        <button
          type="button"
          onClick={() => changeFilter("unread")}
          className={cn(styles.pill, filter === "unread" && styles.pillActive)}
        >
          읽지 않음<span className={styles.pillCount}>{counts.unread}</span>
        </button>
        <button
          type="button"
          onClick={() => changeFilter("pinned")}
          className={cn(styles.pill, filter === "pinned" && styles.pillActive)}
        >
          고정<span className={styles.pillCount}>{counts.pinned}</span>
        </button>
        {isAdmin ? (
          <>
            {/* 관리자 전용 — 서버가 관리자에게만 비멤버 방을 내려준다. */}
            <button
              type="button"
              onClick={() => changeFilter("member")}
              className={cn(styles.pill, filter === "member" && styles.pillActive)}
            >
              참여<span className={styles.pillCount}>{counts.member}</span>
            </button>
            <button
              type="button"
              onClick={() => changeFilter("nonmember")}
              className={cn(styles.pill, filter === "nonmember" && styles.pillActive)}
            >
              미참여<span className={styles.pillCount}>{counts.nonmember}</span>
            </button>
          </>
        ) : null}
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
            {pageCount > 1 ? (
              <div className={styles.pager}>
                <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
              </div>
            ) : null}
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
      alertDialog(failMessage);
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

  const onLeave = async () => {
    // direct 방 나가기 = 내 목록에서 숨김 (새 메시지가 오면 복귀).
    const confirmText =
      room.type === "direct"
        ? `'${room.name}' 님과의 채팅방을 나가시겠습니까?\n목록에서 사라지며, 새 메시지가 오면 다시 표시됩니다.`
        : `'${room.name}' 채팅방에서 나가시겠습니까?`;
    if (!(await confirmDialog(confirmText, { danger: true }))) return;
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
      <button
        type="button"
        className={cn(styles.ctxItem, styles.ctxItemDanger)}
        onClick={onLeave}
        disabled={busy}
        role="menuitem"
      >
        채팅방 나가기
      </button>
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
  const router = useRouter();
  const recorder = useMeetingRecorder();
  const actions = useMeetingRecorderActions();

  // 이 방을 내가 이 탭에서 녹음 중 — hover 여부와 무관하게 빨간 녹음
  // 버튼을 상시 표시한다.
  const recordingHere =
    recorder.recording?.roomId === room.id &&
    (recorder.phase === "recording" || recorder.phase === "stopping");
  // 어딘가에서 녹음/획득 중이면 다른 방의 회의 시작은 막는다 (탭당 1녹음).
  const micDisabled = recorder.phase !== "idle" || recorder.recording !== null;

  // 행 전체가 Link 라 버튼 클릭이 방 이동으로 번지지 않게 preventDefault.
  const onMicClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (micDisabled) return;
    await actions.start(room.id, room.name);
    router.refresh();
  };

  const onRecClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (recorder.phase === "stopping") return;
    if (!(await confirmDialog("진행 중인 회의 녹음을 종료할까요?", { danger: true }))) return;
    await actions.stop();
    router.refresh();
  };

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
        {recordingHere ? (
          <button
            type="button"
            className={styles.recBtn}
            onClick={onRecClick}
            disabled={recorder.phase === "stopping"}
            title="녹음 중 — 클릭하면 회의를 종료합니다"
            aria-label="회의 녹음 종료"
          >
            <span className={styles.recDot} aria-hidden />
          </button>
        ) : (
          <>
            {room.unread > 0 ? (
              <div className={cn(styles.badge, room.muted && styles.badgeMuted)}>
                {room.unread}
              </div>
            ) : room.muted ? (
              <span className={styles.muteIc}>
                <MuteIcon size={14} />
              </span>
            ) : null}
            {/* hover 시 슬라이드-인 (레퍼런스: 날짜 아래 위치) */}
            <button
              type="button"
              className={styles.micBtn}
              onClick={onMicClick}
              disabled={micDisabled}
              title={
                micDisabled
                  ? "이미 진행 중인 녹음이 있습니다"
                  : "이 방에서 회의 녹음을 시작합니다"
              }
              aria-label="회의 시작"
            >
              <MicIcon size={13} />
            </button>
          </>
        )}
      </div>
    </Link>
  );
}
