import type { FileEntry, Project, Room, User } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Tag";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import styles from "./RoomInfoPane.module.css";

interface RoomInfoPaneProps {
  room: Room;
  project?: Project;
  members: User[];
  files: FileEntry[];
  uploaders: Record<string, User | undefined>;
  currentUserId?: string;
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
  currentUserId
}: RoomInfoPaneProps) {
  const memberById = new Map(members.map((u) => [u.id, u] as const));
  const visibleMembers = room.members.slice(0, 4);
  const remaining = Math.max(0, room.members.length - visibleMembers.length);

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
          <button className={cn("btn btn--outline btn--sm", styles.fullBtn)} type="button">
            프로젝트 페이지 열기 →
          </button>
        </div>
      ) : null}

      <div className={styles.section}>
        <h4>멤버 {room.members.length}명</h4>
        {visibleMembers.map((m) => {
          const user = memberById.get(m.userId);
          if (!user) return null;
          return (
            <div key={m.userId} className={styles.member}>
              <Avatar initials={user.initials} tone={user.avatarTone ?? "default"} />
              <div>
                <div className={styles.memberName}>
                  {user.name}
                  {currentUserId && user.id === currentUserId ? " (나)" : ""}
                </div>
                <div className={styles.memberRole}>
                  {user.position} · {user.departmentName}
                </div>
              </div>
              {m.isOwner ? <span className={styles.memberOwner}>OWNER</span> : null}
            </div>
          );
        })}
        {remaining > 0 ? (
          <div className={styles.member}>
            <Avatar initials={`+${remaining}`} tone="gray" />
            <div>
              <div className={styles.memberName}>외 {remaining}명</div>
              <div className={styles.memberRole}>영업본부 · 자재팀 · 외주</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.section}>
        <h4>공유 파일 최근 24건</h4>
        {files.map((f) => {
          const uploader = uploaders[f.uploaderId];
          return (
            <div key={f.id} className={styles.fileRow}>
              <div className={cn(styles.fileIc, fileColor[f.kind])}>{fileLabel[f.kind]}</div>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className={styles.fileName}>{f.name}</div>
                <div className={styles.fileMeta}>
                  {uploader?.name ?? "—"} · {f.uploadedAt}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
