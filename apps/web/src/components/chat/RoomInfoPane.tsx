import Link from "next/link";
import type { FileEntry, Project, Room, User } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Tag";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import { MemberRemoveButton } from "./MemberRemoveButton";
import { RoomFileLink } from "./RoomFileLink";
import styles from "./RoomInfoPane.module.css";

interface RoomInfoPaneProps {
  room: Room;
  project?: Project;
  members: User[];
  files: FileEntry[];
  uploaders: Record<string, User | undefined>;
  currentUserId?: string;
  // Phase 4 G-2b — admin/super_admin 권한자에게 멤버 옆에 [추방] 버튼
  // 노출. 본인 추방은 별도 ([더보기] → 방 나가기). direct 방은 서버가
  // 거부하므로 여기서도 막음.
  isAdmin?: boolean;
}

const fileColor: Record<string, string> = {
  pdf: styles.icPdf,
  xls: styles.icXls,
  doc: styles.icDoc,
  ppt: styles.icPpt,
  img: styles.icImg,
  zip: styles.icZip
};
const fileLabel: Record<string, string> = {
  pdf: "PDF",
  xls: "XLS",
  doc: "DOC",
  ppt: "PPT",
  img: "IMG",
  zip: "ZIP"
};

export function RoomInfoPane({
  room,
  project,
  members,
  files,
  uploaders,
  currentUserId,
  isAdmin = false
}: RoomInfoPaneProps) {
  const memberById = new Map(members.map((u) => [u.id, u] as const));
  // Phase 4 G-2b — 전체 멤버 노출 (이전엔 slice(0,4)로 일부만 보여서
  // 5인 이상 방에서 추방 대상이 안 보이는 문제가 있었음). 멤버 수가
  // 매우 많은 방은 스크롤로 처리.
  const visibleMembers = room.members;
  const canRemove = isAdmin && room.type !== "direct";

  return (
    <aside className={styles.pane}>
      <div className={styles.head}>
        <h3>채팅방 정보</h3>
        <IconButton aria-label="닫기" className={styles.headBtn}>
          <CloseIcon size={14} />
        </IconButton>
      </div>

      {project ? (
        <div className={styles.section}>
          <h4>프로젝트</h4>
          <div className={styles.row}>
            <span className={styles.k}>코드</span>
            <span className={styles.v}>{project.code}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.k}>단계</span>
            <span className={styles.v}>
              <Tag tone="blue" dot>
                {project.stageLabel}
              </Tag>
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.k}>진행률</span>
            <span className={styles.v}>{project.progress}%</span>
          </div>
          <ProgressBar value={project.progress} className={styles.rowProgress} />
          <div className={styles.row} style={{ marginTop: 8 }}>
            <span className={styles.k}>마감일</span>
            <span className={styles.v}>{project.dueDate}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.k}>담당</span>
            <span className={styles.v}>{project.ownerName}</span>
          </div>
          <Link
            href={`/projects/${project.id}`}
            className={cn("btn btn--outline btn--sm", styles.fullBtn)}
          >
            프로젝트 페이지 열기 →
          </Link>
        </div>
      ) : null}

      <div className={styles.section}>
        <h4>멤버 {room.members.length}명</h4>
        {visibleMembers.map((m) => {
          const user = memberById.get(m.userId);
          if (!user) return null;
          const isSelf = !!currentUserId && user.id === currentUserId;
          return (
            <div key={m.userId} className={styles.member}>
              <Avatar initials={user.initials} tone={user.avatarTone ?? "default"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.memberName}>
                  {user.name}
                  {isSelf ? " (나)" : ""}
                </div>
                <div className={styles.memberRole}>
                  {user.position} · {user.departmentName}
                </div>
              </div>
              {m.isOwner ? <span className={styles.memberOwner}>OWNER</span> : null}
              {canRemove && !isSelf ? (
                <MemberRemoveButton
                  roomId={room.id}
                  userId={user.id}
                  userName={user.name}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className={styles.section}>
        <h4>공유 파일 {files.length}건</h4>
        {files.length === 0 ? (
          <div className={styles.empty}>공유된 파일이 없습니다.</div>
        ) : (
          files.map((f) => {
            const uploader = uploaders[f.uploaderId];
            // 클릭 = 다운로드. 앵커는 클라이언트 컴포넌트(RoomFileLink)여야
            // 한다 — 서버 컴포넌트에서 downloadUrl 을 렌더하면 prod SSR 의
            // 내부 컨테이너 URL 이 href 로 박힌다.
            return (
              <RoomFileLink key={f.id} fileId={f.id} className={styles.fileRow}>
                <div className={cn(styles.fileIc, fileColor[f.kind])}>{fileLabel[f.kind]}</div>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className={styles.fileName}>{f.name}</div>
                  <div className={styles.fileMeta}>
                    {uploader?.name ?? "—"} · {f.uploadedAt}
                  </div>
                </div>
              </RoomFileLink>
            );
          })
        )}
      </div>
    </aside>
  );
}
