import { notFound } from "next/navigation";
import Link from "next/link";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon, PinIcon } from "@/components/ui/icons";
import {
  RoomPanelProvider,
  RoomPanelToggleButton,
  RoomPanelBody
} from "@/components/chat/RoomPanelToggle";
import { ChatRoomMessages } from "@/components/chat/ChatRoomMessages";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { RoomInfoPane } from "@/components/chat/RoomInfoPane";
import { PinnedBanner } from "@/components/chat/PinnedBanner";
import { ChatRoomMounter } from "@/components/chat/ChatRoomMounter";
import { ChatRoomActions } from "@/components/chat/ChatRoomActions";
import { RoomFilesTabButton } from "@/components/chat/RoomFilesTabButton";
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
  const [
    messages,
    pinned,
    project,
    users,
    roomFiles,
    projectFiles,
    activeMeeting,
    awaitingPptPage,
    processingPage
  ] = await Promise.all([
    chatService.listMessages(params.roomId, { token, limit: MESSAGE_WINDOW }),
    chatService.getPinnedMessage(params.roomId, { token }),
    room.projectId
      ? projectService.getProject(room.projectId, { token })
      : Promise.resolve(undefined),
    userService.listUsers({ token }),
    // 방 공유파일 — direct(1:1) 방 첨부는 전역 GET /files 에서 제외되므로
    // 멤버 게이트 엔드포인트로 조회한다 (전체 히스토리 기준 최신순).
    fileService.listRoomFiles(params.roomId, { token, limit: 4 }),
    room.projectId
      ? fileService.listFiles({ token, projectId: room.projectId })
      : Promise.resolve([]),
    meetingService.getActiveMeeting(params.roomId, { token }),
    // 헤더의 "PPT 대기 N" 배지 / 비차단 "회의록 생성 중" 배지용 카운트 —
    // meeting:updated 소켓 → router.refresh 로 신선도 유지.
    meetingService.listMeetings(
      { roomId: params.roomId, status: ["awaiting_ppt"], limit: 1 },
      { token }
    ),
    meetingService.listMeetings(
      {
        roomId: params.roomId,
        status: ["pending", "transcribing", "summarizing", "generating_docs"],
        limit: 1
      },
      { token }
    )
  ]);

  const memberUsers = users.filter((u) => room.members.some((m) => m.userId === u.id));
  // 정보 패널 공유파일 4건 — 방 메시지 첨부 우선, 프로젝트방은 프로젝트
  // 파일을 뒤에 병합 (id dedupe).
  const seenFileIds = new Set<string>();
  const visibleFiles = [...roomFiles.rows, ...projectFiles]
    .filter((f) => {
      if (seenFileIds.has(f.id)) return false;
      seenFileIds.add(f.id);
      return true;
    })
    .slice(0, 4);
  const uploaders: Record<string, (typeof users)[number] | undefined> = {};
  for (const f of visibleFiles) {
    uploaders[f.uploaderId] = users.find((u) => u.id === f.uploaderId);
  }

  return (
    <RoomPanelProvider>
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
              <RoomFilesTabButton roomId={room.id} className={styles.tab} />
            ) : null}
          </div>
          <div className={styles.actions}>
            <MeetingHeaderControl
              roomId={room.id}
              roomName={room.name}
              activeMeeting={activeMeeting ?? null}
              awaitingPptCount={awaitingPptPage.total}
              processingCount={processingPage.total}
              currentUserId={me.id}
              isAdmin={me.role === "admin" || me.role === "super_admin"}
            />
            <RoomPanelToggleButton />
            <IconButton aria-label="고정" title="고정된 메시지 (메시지 hover 후 핀 버튼으로 고정/해제)">
              <PinIcon size={18} />
            </IconButton>
            <ChatRoomActions room={room} />
            {/* 채팅방 닫기 — 목록으로 복귀. 정보 패널이 숨는 좁은 화면
                에서도 사이드바 없이 목록으로 돌아갈 수 있는 진입점. */}
            <Link
              href="/chat"
              aria-label="채팅방 닫기"
              title="채팅방 닫기 — 채팅 목록으로"
              className="icon-btn"
            >
              <CloseIcon size={18} />
            </Link>
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

      {/* 우측 정보 패널 — 헤더의 [멤버] 버튼으로 표시/숨김, 패널 X 는
          패널만 닫는다. */}
      <RoomPanelBody>
        <RoomInfoPane
          room={room}
          project={project}
          members={memberUsers}
          files={visibleFiles}
          uploaders={uploaders}
          currentUserId={me.id}
          isAdmin={me.role === "admin" || me.role === "super_admin"}
        />
      </RoomPanelBody>
    </div>
    </RoomPanelProvider>
  );
}
