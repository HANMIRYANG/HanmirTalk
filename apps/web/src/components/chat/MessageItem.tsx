import type { ChatMessage } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { DownloadIcon } from "@/components/ui/icons";
import { fileService } from "@/services/file.service";
import { cn } from "@/lib/classNames";
import styles from "./MessageItem.module.css";

interface MessageItemProps {
  message: ChatMessage;
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
  xls: "XLSX",
  doc: "DOCX",
  ppt: "PPTX",
  img: "IMG",
  zip: "ZIP"
};

export function MessageItem({ message }: MessageItemProps) {
  if (message.isSystem) {
    return (
      <div className={styles.sys}>
        <span>{message.body}</span>
      </div>
    );
  }

  return (
    <div className={cn(styles.msg, message.groupedWithPrev && styles.grouped)}>
      <div className={styles.avatarBlock}>
        <Avatar
          initials={message.initials}
          tone={message.avatarTone ?? "default"}
          className={styles.avatar}
        />
      </div>
      <div>
        <div className={styles.head}>
          <span className={styles.name}>{message.authorName}</span>
          {message.authorRole ? <span className={styles.role}>{message.authorRole}</span> : null}
          <span className={styles.time}>{message.createdAt}</span>
        </div>
        <div className={styles.body}>{renderBodyWithMentions(message.body, message.mentions)}</div>

        {message.attachment ? (
          <div className={styles.file}>
            <div className={cn(styles.fileIc, fileColor[message.attachment.kind])}>
              {fileLabel[message.attachment.kind]}
            </div>
            <div>
              <div className={styles.fileName}>{message.attachment.name}</div>
              <div className={styles.fileMeta}>{message.attachment.meta}</div>
            </div>
            <div className={styles.fileActions}>
              <a
                href={fileService.downloadUrl(message.attachment.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--outline btn--sm"
                aria-label="다운로드"
                title="다운로드"
              >
                <DownloadIcon size={14} />
              </a>
            </div>
          </div>
        ) : null}

        {message.reactions && message.reactions.length > 0 ? (
          <div className={styles.reactions}>
            {message.reactions.map((r) => (
              <span key={r.emoji} className={styles.react}>
                {r.emoji} {r.count}
              </span>
            ))}
            <span className={cn(styles.react, styles.reactPlain)}>+</span>
          </div>
        ) : null}

        {message.threadReplyCount ? (
          <div className={styles.thread}>
            <div className={styles.threadAvatars}>
              {message.threadReplyAvatars?.map((a, i) => (
                <Avatar
                  key={i}
                  initials={a.initials}
                  tone={a.tone ?? "default"}
                  className={styles.threadAvatar}
                />
              ))}
            </div>
            <span>답글 {message.threadReplyCount}개</span>
            {message.threadLastReplyAt ? (
              <span className={styles.threadMuted}>· 마지막 답글 {message.threadLastReplyAt}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function renderBodyWithMentions(body: string, mentions?: string[]) {
  if (!mentions || mentions.length === 0) return body;
  const parts: (string | JSX.Element)[] = [];
  let remaining = body;
  let key = 0;
  for (const name of mentions) {
    const token = `@${name}`;
    const idx = remaining.indexOf(token);
    if (idx === -1) continue;
    parts.push(remaining.slice(0, idx));
    parts.push(
      <span key={key++} className={styles.mention}>
        {token}
      </span>
    );
    remaining = remaining.slice(idx + token.length);
  }
  parts.push(remaining);
  return parts;
}
