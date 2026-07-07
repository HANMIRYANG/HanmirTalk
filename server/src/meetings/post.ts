// 회의 파이프라인의 서버발 메시지 게시 — scheduled-poller.ts 의 3-콜
// 템플릿(repos.messages.append → realtime.emitMessageNew → notifyMessageNew)
// 을 재사용한다. 시작/종료/실패 안내는 isSystem 메시지, 산출물 DOCX 는
// 회의 시작자 명의의 일반 파일 메시지(메시지당 첨부 1개 제약 → DOCX 2건
// = 메시지 2건).
import { randomBytes } from "crypto";
import type { ChatMessage } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { realtime } from "../realtime";
import { notifyMessageNew } from "../notify";

function newMessageId(): string {
  return `m-${randomBytes(6).toString("hex")}`;
}

async function loadAuthor(repos: Repositories, userId: string) {
  const author = await repos.users.findById(userId);
  if (!author) return undefined;
  return author;
}

// 시스템 안내 한 줄. in-app 알림은 만들지 않는다 — room:membership 등
// 시스템성 이벤트와 동일 정책 (회의 시작/종료마다 멤버 전원 알림은 소음).
export async function postMeetingSystemMessage(
  repos: Repositories,
  roomId: string,
  authorId: string,
  body: string
): Promise<void> {
  const author = await loadAuthor(repos, authorId);
  if (!author) return; // 시작자 퇴사 등 — 안내 없이 진행
  const saved = await repos.messages.append(roomId, {
    id: newMessageId(),
    roomId,
    authorId: author.id,
    authorName: author.name,
    avatarTone: author.avatarTone,
    initials: author.initials,
    body,
    createdAt: new Date().toISOString(),
    isSystem: true
  });
  realtime.emitMessageNew(roomId, saved);
}

// 산출물 파일 메시지 — 일반 메시지와 동일하게 알림까지 dispatch.
export async function postMeetingFileMessage(
  repos: Repositories,
  roomId: string,
  authorId: string,
  body: string,
  attachmentId: string
): Promise<void> {
  const author = await loadAuthor(repos, authorId);
  if (!author) return;
  let attachment: ChatMessage["attachment"] | undefined;
  const file = await repos.files.findById(attachmentId);
  if (file) {
    attachment = { id: file.id, kind: file.kind, name: file.name, meta: file.size };
  }
  const saved = await repos.messages.append(
    roomId,
    {
      id: newMessageId(),
      roomId,
      authorId: author.id,
      authorName: author.name,
      authorRole: `${author.position} · ${author.departmentName}`,
      avatarTone: author.avatarTone,
      initials: author.initials,
      body,
      createdAt: new Date().toISOString(),
      attachment
    },
    { attachmentId }
  );
  realtime.emitMessageNew(roomId, saved);
  void notifyMessageNew(repos, roomId, saved);
}
