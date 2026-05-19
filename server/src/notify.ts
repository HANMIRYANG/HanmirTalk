import type {
  ChatMessage,
  MessageEntity,
  Notice,
  Notification,
  Decision,
  TaskItem,
  Project
} from "@hanmir/shared";
import type { Repositories } from "./repositories/types";
import { realtime } from "./realtime";
import { pushNotification } from "./push";

// Phase 6 I-2 — central notification dispatch. Routes call these from
// their hot paths after a successful write. Settings 존중: 사용자가
// all_enabled=false 또는 per_room/per_project 에 false 설정해두면 skip.
//
// 실패는 silent — 알림 누락이 본 작업(메시지 전송 등)을 깨면 안 됨.

// 한 row를 in-app socket + (설정 켜져있으면) OS push로 발사. 두 채널
// 모두 실패해도 본 hook은 throw하지 않는다.
async function dispatch(repos: Repositories, n: Notification): Promise<void> {
  realtime.emitNotificationNew(n);
  try {
    const s = await repos.notifications.getSettings(n.userId);
    if (s.webPushEnabled) {
      void pushNotification(repos, n);
    }
  } catch {
    // settings 조회 실패는 default(push off)로 처리 — 안전한 방향
  }
}

async function dispatchAll(repos: Repositories, list: Notification[]): Promise<void> {
  for (const n of list) await dispatch(repos, n);
}

async function shouldNotify(
  repos: Repositories,
  userId: string,
  ctx: { roomId?: string; projectId?: string }
): Promise<boolean> {
  try {
    const s = await repos.notifications.getSettings(userId);
    if (!s.allEnabled) return false;
    if (ctx.roomId && s.perRoom[ctx.roomId] === false) return false;
    if (ctx.projectId && s.perProject[ctx.projectId] === false) return false;
    return true;
  } catch {
    // 설정 조회 실패하면 default(true)로 알림 발송.
    return true;
  }
}

// 새 메시지 — 같은 방의 다른 멤버 모두 + 멘션된 사용자
export async function notifyMessageNew(
  repos: Repositories,
  roomId: string,
  message: ChatMessage
): Promise<void> {
  try {
    const room = await repos.rooms.findById(roomId);
    if (!room) return;
    const memberIds = room.members
      .map((m) => m.userId)
      .filter((uid) => uid !== message.authorId);
    // 멘션된 사용자는 별도 알림(더 강한 신호)으로. 메시지 알림은 멘션 빼고.
    const mentionedIds = (message.entities ?? [])
      .filter((e: MessageEntity) => e.type === "mention")
      .map((e) => e.id)
      .filter((uid) => uid !== message.authorId);
    const mentionSet = new Set(mentionedIds);
    const messageRecipients = memberIds.filter((uid) => !mentionSet.has(uid));

    // 일반 메시지 알림 — settings 존중
    const allowedRecipients: string[] = [];
    for (const uid of messageRecipients) {
      if (await shouldNotify(repos, uid, { roomId })) allowedRecipients.push(uid);
    }
    if (allowedRecipients.length > 0) {
      const created = await repos.notifications.createMany(allowedRecipients, {
        kind: "message:new",
        title: `${message.authorName}님의 새 메시지`,
        body: message.body.slice(0, 120),
        link: `/chat/${roomId}`,
        payload: { roomId, messageId: message.id, roomName: room.name }
      });
      await dispatchAll(repos, created);
    }

    // 멘션 알림 — 별도, 더 우선순위 높은 kind
    const allowedMentioned: string[] = [];
    for (const uid of mentionedIds) {
      if (memberIds.includes(uid) && (await shouldNotify(repos, uid, { roomId }))) {
        allowedMentioned.push(uid);
      }
    }
    if (allowedMentioned.length > 0) {
      const created = await repos.notifications.createMany(allowedMentioned, {
        kind: "mention",
        title: `${message.authorName}님이 회원님을 언급했습니다`,
        body: message.body.slice(0, 120),
        link: `/chat/${roomId}`,
        payload: { roomId, messageId: message.id }
      });
      await dispatchAll(repos, created);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] notifyMessageNew failed:", err);
  }
}

// 새 공지 — 모든 활성 사용자 (본인 제외)
export async function notifyNoticeNew(
  repos: Repositories,
  authorUserId: string,
  notice: Notice
): Promise<void> {
  try {
    const users = await repos.users.list();
    const recipients = users
      .filter((u) => u.isActive !== false && u.id !== authorUserId)
      .map((u) => u.id);
    const allowed: string[] = [];
    for (const uid of recipients) {
      if (await shouldNotify(repos, uid, {})) allowed.push(uid);
    }
    if (allowed.length === 0) return;
    const created = await repos.notifications.createMany(allowed, {
      kind: notice.isMandatory ? "notice:mandatory" : "notice:new",
      title: notice.isMandatory ? "필독 공지가 등록되었습니다" : "새 공지",
      body: notice.title,
      link: `/notices`,
      payload: { noticeId: notice.id, isMandatory: notice.isMandatory }
    });
    await dispatchAll(repos, created);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] notifyNoticeNew failed:", err);
  }
}

// 업무 배정 변경 — 새 assignee들에게
export async function notifyTaskAssigned(
  repos: Repositories,
  task: TaskItem,
  newAssigneeIds: string[],
  actorUserId: string
): Promise<void> {
  try {
    const recipients = newAssigneeIds.filter((uid) => uid !== actorUserId);
    const allowed: string[] = [];
    for (const uid of recipients) {
      if (await shouldNotify(repos, uid, { projectId: task.projectId })) allowed.push(uid);
    }
    if (allowed.length === 0) return;
    const created = await repos.notifications.createMany(allowed, {
      kind: "task:assigned",
      title: "새 업무가 배정되었습니다",
      body: `${task.code} ${task.title}`,
      link: `/projects/${task.projectId}/tasks`,
      payload: { projectId: task.projectId, taskId: task.id }
    });
    await dispatchAll(repos, created);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] notifyTaskAssigned failed:", err);
  }
}

// 프로젝트 상태 변경 — 프로젝트 멤버 (본인 제외)
export async function notifyProjectUpdated(
  repos: Repositories,
  project: Project,
  actorUserId: string,
  reason: string
): Promise<void> {
  try {
    const recipients = project.memberIds.filter((uid) => uid !== actorUserId);
    const allowed: string[] = [];
    for (const uid of recipients) {
      if (await shouldNotify(repos, uid, { projectId: project.id })) allowed.push(uid);
    }
    if (allowed.length === 0) return;
    const created = await repos.notifications.createMany(allowed, {
      kind: "project:updated",
      title: `프로젝트 상태 변경`,
      body: `${project.code} ${project.name} — ${reason}`,
      link: `/projects/${project.id}`,
      payload: { projectId: project.id, reason }
    });
    await dispatchAll(repos, created);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] notifyProjectUpdated failed:", err);
  }
}

// 결정사항 등록 — 프로젝트 멤버 (decided_by 제외)
export async function notifyDecisionNew(
  repos: Repositories,
  decision: Decision
): Promise<void> {
  try {
    const project = await repos.projects.findById(decision.projectId);
    if (!project) return;
    const recipients = project.memberIds.filter((uid) => uid !== decision.decidedById);
    const allowed: string[] = [];
    for (const uid of recipients) {
      if (await shouldNotify(repos, uid, { projectId: project.id })) allowed.push(uid);
    }
    if (allowed.length === 0) return;
    const created = await repos.notifications.createMany(allowed, {
      kind: "decision:new",
      title: "새 결정사항이 등록되었습니다",
      body: decision.title,
      link: `/projects/${project.id}/decisions`,
      payload: { projectId: project.id, decisionId: decision.id }
    });
    await dispatchAll(repos, created);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] notifyDecisionNew failed:", err);
  }
}
