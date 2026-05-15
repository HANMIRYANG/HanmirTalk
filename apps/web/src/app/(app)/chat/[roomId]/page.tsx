import { notFound } from "next/navigation";
import Link from "next/link";
import { IconButton } from "@/components/ui/IconButton";
import { MoreIcon, PinIcon, UsersIcon } from "@/components/ui/icons";
import { MessageItem } from "@/components/chat/MessageItem";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { RoomInfoPane } from "@/components/chat/RoomInfoPane";
import { chatService } from "@/services/chat.service";
import { projectService } from "@/services/project.service";
import { userService } from "@/services/user.service";
import { fileService } from "@/services/file.service";
import { authService } from "@/services/auth.service";
import { getServerToken } from "@/lib/server-auth";
import styles from "./room.module.css";

interface Props {
  params: { roomId: string };
}

// Auth guard is enforced in apps/web/src/app/(app)/layout.tsx.
export default async function ChatRoomPage({ params }: Props) {
  const token = getServerToken();
  const me = await authService.getMe(token);

  const room = await chatService.getRoom(params.roomId, { token });
  if (!room) notFound();

  const [messages, pinned, project, users, files] = await Promise.all([
    chatService.listMessages(params.roomId, { token }),
    chatService.getPinnedMessage(params.roomId, { token }),
    room.projectId
      ? projectService.getProject(room.projectId, { token })
      : Promise.resolve(undefined),
    userService.listUsers({ token }),
    fileService.listFiles({ token })
  ]);

  const memberUsers = users.filter((u) => room.members.some((m) => m.userId === u.id));
  const relevantFiles = files
    .filter((f) => room.projectId && f.scope === room.projectId.toUpperCase().replace("P-", "P-"))
    .slice(0, 4);
  const visibleFiles = relevantFiles.length > 0 ? relevantFiles : files.slice(0, 4);
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
              # {room.name}
              <span className={styles.topMembers}>· {room.members.length}명</span>
            </h1>
            <div className={styles.topMeta}>
              {project
                ? `${project.department} · ${project.ownerName} · 마감 ${project.dueDate}`
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
                  업무 12
                </Link>
                <Link href={`/projects/${project.id}/gantt`} className={styles.tab}>
                  간트
                </Link>
              </>
            ) : null}
            <button className={styles.tab} type="button">
              파일 24
            </button>
            <button className={styles.tab} type="button">
              결정 기록 3
            </button>
          </div>
          <div className={styles.actions}>
            <IconButton aria-label="멤버">
              <UsersIcon size={18} />
            </IconButton>
            <IconButton aria-label="고정">
              <PinIcon size={18} />
            </IconButton>
            <IconButton aria-label="더보기">
              <MoreIcon size={18} />
            </IconButton>
          </div>
        </header>

        {pinned ? (
          <div className={styles.pinned}>
            <PinIcon size={14} />
            <div>
              <b>고정 메시지</b> · {pinned.author}: {pinned.body}
            </div>
            <button className="btn btn--ghost btn--sm" style={{ marginLeft: "auto" }} type="button">
              자세히
            </button>
          </div>
        ) : null}

        <div className={styles.msgs}>
          <div className={styles.daySep}>2026년 5월 13일 수요일</div>
          {messages.map((m) => (
            <MessageItem key={m.id} message={m} />
          ))}
        </div>

        <MessageComposer roomId={room.id} roomName={room.name} />
      </main>

      <RoomInfoPane
        room={room}
        project={project}
        members={memberUsers}
        files={visibleFiles}
        uploaders={uploaders}
        currentUserId={me.id}
      />
    </div>
  );
}
