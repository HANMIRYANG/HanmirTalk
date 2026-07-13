// Phase 10 M-4 — 예약 메시지 poller.
//
// 1분 주기 recursive setTimeout. setInterval 대신 매 발사 후 다음 발사를
// 다시 잡는 패턴이라 시스템 클럭 drift / suspend 영향에 강하다 (notify.ts
// 의 due-soon cron 과 동일 디자인).
//
// 단일 VM (N-0) 가정이라 row lock 까지는 가지 않고, repo.markSent 의
// "sent_at IS NULL" guard 만으로 중복 발사를 차단한다. 같은 poller 가
// 같은 row 를 두 번 잡아도 두 번째 markSent 가 false 를 반환해 emit/
// notify 가 한 번만 흐른다.
//
// 전송 시점 멤버십 재확인:
// - room.is_active=false 면 발송 거부 → markFailed
// - 작성자(user_id) 가 더 이상 해당 방의 member 가 아니면 거부 → markFailed
// - admin/super_admin 은 예외 — admin 이 예약을 만들었다면 비멤버 방에도
//   발사된다 (POST /schedule 가 이미 admin 패스를 허용)
//
// 첨부가 있는 예약은 attachment row 가 사라지지 않은 한 같이 발사된다.
// scheduled_messages.attachment_id 는 ON DELETE SET NULL 이므로 사라진
// 첨부는 본문만 보낸다.

import type { ChatMessage } from "@hanmir/shared";
import { randomBytes } from "crypto";
import type { Repositories } from "./repositories/types";
import { realtime } from "./realtime";
import { notifyMessageNew } from "./notify";

const POLL_INTERVAL_MS = 60 * 1000; // 60s
let timer: NodeJS.Timeout | null = null;
let running = false;

function newMessageId(): string {
  return `m-${randomBytes(6).toString("hex")}`;
}

export async function pollScheduledMessagesOnce(repos: Repositories): Promise<void> {
  // 동시 실행 방지 — 이전 tick 의 작업이 길어지면 다음 tick 은 건너뛴다.
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const due = await repos.scheduledMessages.listDue(now);
    if (due.length === 0) return;
    for (const item of due) {
      try {
        const author = await repos.users.findById(item.userId);
        if (!author || author.isActive === false) {
          await repos.scheduledMessages.markFailed(item.id, "author_inactive");
          continue;
        }
        const room = await repos.rooms.findById(item.roomId, author.id);
        if (!room) {
          await repos.scheduledMessages.markFailed(item.id, "room_not_found");
          continue;
        }
        const isAdmin = author.role === "admin" || author.role === "super_admin";
        const isMember = room.members.some((m) => m.userId === author.id);
        if (!isAdmin && !isMember) {
          await repos.scheduledMessages.markFailed(item.id, "not_a_member");
          continue;
        }

        // sent_at guard 로 중복 차단. 다른 인스턴스/같은 인스턴스 두 번
        // 잡혀도 한 번만 true.
        const claimed = await repos.scheduledMessages.markSent(item.id, now);
        if (!claimed) {
          // 이미 누군가 보냈으니 skip — 에러도 아님.
          continue;
        }

        // attachment 가 살아있는지 확인. 사라졌으면 본문만 발송.
        let attachment: ChatMessage["attachment"] | undefined;
        if (item.attachmentId) {
          const file = await repos.files.findById(item.attachmentId);
          if (file) {
            attachment = {
              id: file.id,
              kind: file.kind,
              name: file.name,
              meta: file.size
            };
          }
        }

        const saved: ChatMessage = await repos.messages.append(
          item.roomId,
          {
            id: newMessageId(),
            roomId: item.roomId,
            authorId: author.id,
            authorName: author.name,
            authorRole: `${author.position} · ${author.departmentName}`,
            avatarTone: author.avatarTone,
            initials: author.initials,
            body: item.content,
            createdAt: now.toISOString(),
            attachment,
            entities: item.entities.length > 0 ? item.entities : undefined
          },
          item.attachmentId ? { attachmentId: item.attachmentId } : undefined
        );

        // direct 방을 "나가기"(숨김)한 멤버는 새 메시지로 목록에 복귀.
        if (room.type === "direct") {
          const unhidden = await repos.rooms.unhideAll(item.roomId);
          for (const uid of unhidden) {
            realtime.emitRoomMembershipChanged(item.roomId, {
              kind: "join",
              userId: uid
            });
          }
        }
        realtime.emitMessageNew(item.roomId, saved);
        // 일반 메시지와 동일하게 알림 dispatch.
        void notifyMessageNew(repos, item.roomId, saved);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(
          `[hanmir-server] scheduled-poller item ${item.id} failed:`,
          msg
        );
        try {
          await repos.scheduledMessages.markFailed(item.id, msg);
        } catch {
          // best-effort — markFailed 자체가 실패하면 다음 tick 에 다시 시도.
        }
      }
    }
  } finally {
    running = false;
  }
}

function scheduleNext(repos: Repositories): void {
  timer = setTimeout(() => {
    void pollScheduledMessagesOnce(repos).finally(() => scheduleNext(repos));
  }, POLL_INTERVAL_MS);
  timer.unref();
}

export function startScheduledMessagePoller(repos: Repositories): void {
  if (timer) return;
  // 첫 tick 은 부팅 직후 빠르게 한 번 (배포 직전 예약된 row 처리). 단,
  // 초기 부팅 부담을 피하려고 약간 지연.
  timer = setTimeout(() => {
    void pollScheduledMessagesOnce(repos).finally(() => scheduleNext(repos));
  }, 10_000);
  timer.unref();
  // eslint-disable-next-line no-console
  console.log(
    `[hanmir-server] scheduled-message poller: every ${POLL_INTERVAL_MS / 1000}s (first tick in 10s)`
  );
}

export function stopScheduledMessagePoller(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
