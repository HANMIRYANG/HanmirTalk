import { notFound } from "next/navigation";
import Link from "next/link";
import { IconButton } from "@/components/ui/IconButton";
import { PinIcon, UsersIcon } from "@/components/ui/icons";
import { ChatRoomMessages } from "@/components/chat/ChatRoomMessages";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { RoomInfoPane } from "@/components/chat/RoomInfoPane";
import { PinnedBanner } from "@/components/chat/PinnedBanner";
import { ChatRoomMounter } from "@/components/chat/ChatRoomMounter";
import { ChatRoomActions } from "@/components/chat/ChatRoomActions";
import { MeetingHeaderControl } from "@/components/meeting/MeetingHeaderControl";
import { chatService } from "@/services/chat.service";
import { projectService } from "@/services/project.service";
import { userService } from "@/services/user.service";
import { fileService } from "@/services/file.service";
import { meetingService } from "@/services/meeting.service";
import { requireServerMe } from "@/lib/server-auth";
import styles from "./room.module.css";

interface Props {
  params: { roomId: string };
}

// Auth guard is enforced in apps/web/src/app/(app)/layout.tsx.
export default async function ChatRoomPage({ params }: Props) {
  const { me, token } = await requireServerMe();

  const room = await chatService.getRoom(params.roomId, { token });
  if (!room) notFound();

  // 타임라인은 최신 100개 윈도우만 SSR — 과거 메시지는 클라이언트의
  // "이전 메시지 보기" 가 ?before 커서로 추가 로드한다.
  const MESSAGE_WINDOW = 100;
  const [messages, pinned, project, users, files, activeMeeting] = await Promise.all([
    chatService.listMessages(params.roomId, { token, limit: MESSAGE_WINDOW }),
    chatService.getPinnedMessage(params.roomId, { token }),
    room.projectId
      ? projectService.getProject(room.projectId, { token })
      : Promise.resolve(undefined),
    userService.listUsers({ token }),
    fileService.listFiles({ token }),
    meetingService.getActiveMeeting(params.roomId, { token })
  ]);

  const memberUsers = users.filter((u) => room.members.some((m) => m.userId === u.id));
  const messageAttachmentIds = new Set(
    messages.map((m) => m.attachment?.id).filter((id): id is string => Boolean(id))
  );
  const visibleFiles = files
    .filter((f) =>
      room.projectId
        ? f.projectId === room.projectId || messageAttachmentIds.has(f.id)
        : messageAttachmentIds.has(f.id)
    )
    .slice(0, 4);
  const uploaders: Record<string, (typeof users)[number] | undefined> = {};
  for (const f of visibleFiles) {
    uploaders[f.uploaderId] = users.find((u) => u.id === f.uploaderId);
  }

  return (
    <div className={styles.row}>
      <main className={styles.main}>
        <header className={styles.top}>
          <div className={styles.topAvatar}>{room.avatarLabel ?? room.name.slice(0, 2)}</div>
          <div>
            <h1 className={styles.topTitle}>
              {room.type === "direct" ? room.name : `# ${room.name}`}
              <span className={styles.topMembers}>· {room.members.length}명</span>
            </h1>
            <div className={styles.topMeta}>
              {project
                ? `${project.department} · ${project.ownerName} · 마감 ${project.dueDate}`
                : room.type === "direct"
                ? "1:1 대화"
                : "그룹 채팅방"}
            </div>
          </div>
          <div className={styles.tabs}>
            <button className={`${styles.tab} ${styles.tabActive}`} type="button">
              대화
            </button>
            {project ? (
              <>
                <Link href={`/projects/${project.id}/tasks`} className={styles.tab}>
                  업무 {project.taskCounts.total}
                </Link>
                <Link href={`/projects/${project.id}/gantt`} className={styles.tab}>
                  간트
                </Link>
                <Link href={`/projects/${project.id}/files`} className={styles.tab}>
                  파일
                </Link>
              </>
            ) : null}
            {!project ? (
              <button className={styles.tab} type="button" disabled>
                파일
              </button>
            ) : null}
          </div>
          <div className={styles.actions}>
            <MeetingHeaderControl
              roomId={room.id}
              roomName={room.name}
              activeMeeting={activeMeeting ?? null}
              currentUserId={me.id}
              isAdmin={me.role === "admin" || me.role === "super_admin"}
            />
            <IconButton aria-label="멤버" title="우측 패널에 멤버 표시">
              <UsersIcon size={18} />
            </IconButton>
            <IconButton aria-label="고정" title="고정된 메시지 (메시지 hover 후 핀 버튼으로 고정/해제)">
              <PinIcon size={18} />
            </IconButton>
            <ChatRoomActions room={room} />
          </div>
        </header>

        {pinned ? (
          <PinnedBanner roomId={room.id} pinned={pinned} />
        ) : null}

        <div className={styles.msgs}>
          {messages.length > 0 ? <div className={styles.daySep}>최근 대화</div> : null}
          <ChatRoomMessages
            roomId={room.id}
            messages={messages}
            mayHaveOlder={messages.length >= MESSAGE_WINDOW}
            currentUserId={me.id}
            isAdmin={me.role === "admin" || me.role === "super_admin"}
            pinnedMessageId={room.pinnedMessageId}
            canCreateDecision={
              !!room.projectId &&
              ["admin", "super_admin", "manager", "project_owner"].includes(me.role)
            }
            canCreateTask={
              !!room.projectId &&
              ["admin", "super_admin", "manager", "project_owner"].includes(me.role)
            }
            users={room.projectId ? users : undefined}
            projectId={room.projectId}
          />
        </div>

        <MessageComposer
          roomId={room.id}
          roomName={room.name}
          projectId={room.projectId}
        />
        <ChatRoomMounter
          roomId={room.id}
          latestMessageId={messages[messages.length - 1]?.id}
        />
      </main>

      <RoomInfoPane
        room={room}
        project={project}
        members={memberUsers}
        files={visibleFiles}
        uploaders={uploaders}
        currentUserId={me.id}
        isAdmin={me.role === "admin" || me.role === "super_admin"}
      />
    </div>
  );
}
