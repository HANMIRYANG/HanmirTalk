import type {
  ChatMessage,
  MessageEntity,
  Notice,
  Notification,
  NotificationSettings,
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

type SettingsMap = Map<string, NotificationSettings>;

// 수신 후보 전체의 설정을 한 번에 조회 — 루프 내 개별 getSettings 로 인한
// N+1 회피. 실패 시 undefined (= 조회 실패, 호출부에서 default 처리).
async function loadSettings(
  repos: Repositories,
  userIds: string[]
): Promise<SettingsMap | undefined> {
  if (userIds.length === 0) return new Map();
  try {
    return await repos.notifications.getSettingsMany(userIds);
  } catch {
    return undefined;
  }
}

// 설정 조회 실패(s === undefined)는 default(true)로 알림 발송 — 기존
// shouldNotify 의 catch 동작과 동일.
function settingsAllow(
  s: NotificationSettings | undefined,
  ctx: { roomId?: string; projectId?: string }
): boolean {
  if (!s) return true;
  if (!s.allEnabled) return false;
  if (ctx.roomId && s.perRoom[ctx.roomId] === false) return false;
  if (ctx.projectId && s.perProject[ctx.projectId] === false) return false;
  return true;
}

// 생성된 알림들을 in-app socket + (설정 켜져있으면) OS push로 발사.
// settings 를 호출부에서 이미 조회했으면 재사용한다. 조회 실패는
// default(push off)로 처리 — 안전한 방향. throw 하지 않는다.
async function dispatchAll(
  repos: Repositories,
  list: Notification[],
  settings?: SettingsMap
): Promise<void> {
  if (list.length === 0) return;
  const s = settings ?? (await loadSettings(repos, list.map((n) => n.userId)));
  for (const n of list) {
    realtime.emitNotificationNew(n);
    if (s?.get(n.userId)?.webPushEnabled) {
      void pushNotification(repos, n);
    }
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

    // Phase 8 K-4 — 전사 카테고리 게이트 (회사 전체 off면 발송 안 함).
    const [messageEnabled, mentionEnabled] = await Promise.all([
      repos.orgNotifications.isCategoryEnabled("message"),
      repos.orgNotifications.isCategoryEnabled("mention")
    ]);

    if (!messageEnabled && !mentionEnabled) return;

    // 멤버 전체 설정을 한 번에 조회 (메시지/멘션 수신자 모두 멤버의 부분집합).
    const settings = await loadSettings(repos, memberIds);

    // 일반 메시지 알림 — settings 존중
    if (messageEnabled) {
      const allowedRecipients = messageRecipients.filter((uid) =>
        settingsAllow(settings?.get(uid), { roomId })
      );
      if (allowedRecipients.length > 0) {
        const created = await repos.notifications.createMany(allowedRecipients, {
          kind: "message:new",
          title: `${message.authorName}님의 새 메시지`,
          body: message.body.slice(0, 120),
          link: `/chat/${roomId}`,
          payload: { roomId, messageId: message.id, roomName: room.name }
        });
        await dispatchAll(repos, created, settings);
      }
    }

    // 멘션 알림 — 별도, 더 우선순위 높은 kind
    if (mentionEnabled) {
      const allowedMentioned = mentionedIds.filter(
        (uid) => memberIds.includes(uid) && settingsAllow(settings?.get(uid), { roomId })
      );
      if (allowedMentioned.length > 0) {
        const created = await repos.notifications.createMany(allowedMentioned, {
          kind: "mention",
          title: `${message.authorName}님이 회원님을 언급했습니다`,
          body: message.body.slice(0, 120),
          link: `/chat/${roomId}`,
          payload: { roomId, messageId: message.id }
        });
        await dispatchAll(repos, created, settings);
      }
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
    if (!(await repos.orgNotifications.isCategoryEnabled("notice"))) return;
    const users = await repos.users.list();
    const recipients = users
      .filter((u) => u.isActive !== false && u.id !== authorUserId)
      .map((u) => u.id);
    const settings = await loadSettings(repos, recipients);
    const allowed = recipients.filter((uid) => settingsAllow(settings?.get(uid), {}));
    if (allowed.length === 0) return;
    const created = await repos.notifications.createMany(allowed, {
      kind: notice.isMandatory ? "notice:mandatory" : "notice:new",
      title: notice.isMandatory ? "필독 공지가 등록되었습니다" : "새 공지",
      body: notice.title,
      link: `/notices`,
      payload: { noticeId: notice.id, isMandatory: notice.isMandatory }
    });
    await dispatchAll(repos, created, settings);
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
    if (!(await repos.orgNotifications.isCategoryEnabled("task"))) return;
    const recipients = newAssigneeIds.filter((uid) => uid !== actorUserId);
    const settings = await loadSettings(repos, recipients);
    const allowed = recipients.filter((uid) =>
      settingsAllow(settings?.get(uid), { projectId: task.projectId })
    );
    if (allowed.length === 0) return;
    const created = await repos.notifications.createMany(allowed, {
      kind: "task:assigned",
      title: "새 업무가 배정되었습니다",
      body: `${task.code} ${task.title}`,
      link: `/projects/${task.projectId}/tasks`,
      payload: { projectId: task.projectId, taskId: task.id }
    });
    await dispatchAll(repos, created, settings);
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
    if (!(await repos.orgNotifications.isCategoryEnabled("project"))) return;
    const recipients = project.memberIds.filter((uid) => uid !== actorUserId);
    const settings = await loadSettings(repos, recipients);
    const allowed = recipients.filter((uid) =>
      settingsAllow(settings?.get(uid), { projectId: project.id })
    );
    if (allowed.length === 0) return;
    const created = await repos.notifications.createMany(allowed, {
      kind: "project:updated",
      title: `프로젝트 상태 변경`,
      body: `${project.code} ${project.name} — ${reason}`,
      link: `/projects/${project.id}`,
      payload: { projectId: project.id, reason }
    });
    await dispatchAll(repos, created, settings);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] notifyProjectUpdated failed:", err);
  }
}

// Phase 6 I-2 — 마감 임박 알림. 매일 KST 09:00 1회 in-process scheduler 가
// 호출 (server/src/index.ts 참조). status != "done" AND dueDate <= today
// (KST) 인 task 를 스캔해 assignee 들에게 task:due_soon 알림 발송.
//
// Codex 검수 strong-concern #1 반영: tasks.list 는 cancelled 프로젝트의
// task 도 반환하므로 project 존재+비취소 + assignee 가 여전히 활성+멤버
// 인지 다시 검증한다.
//
// 중복 방지는 in-memory Set — Codex 검수 strong-concern #3 / D4 결정대로
// "중복 손해 = 알림 1개 더" 수준만 보장 (재시작 시 같은 날 발사된 알림이
// 한 번 더 갈 수 있음). 영속 dedup 이 필요해지면 별도 로그 테이블 도입.
const dueSoonSentToday = new Set<string>();
let dueSoonSetDay: string | undefined;

function ensureDueSoonSetForToday(today: string): void {
  if (dueSoonSetDay !== today) {
    dueSoonSentToday.clear();
    dueSoonSetDay = today;
  }
}

// KST(UTC+9) 의 "오늘" 을 YYYY-MM-DD 로 반환. 서버 클럭이 UTC 일 수 있어
// 명시 계산 — `Date#toLocaleDateString("ko-KR")` 에 의존하지 않고 offset
// 만으로 계산해 OS 로케일 영향 제거.
export function kstTodayString(now: Date = new Date()): string {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysFromTo(dueDate: string, today: string): number {
  // 둘 다 YYYY-MM-DD 가정. Date.parse 로 UTC 자정 기준 차이를 일 단위로.
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const td = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(td)) return 0;
  return Math.round((due - td) / (24 * 60 * 60 * 1000));
}

export async function notifyTaskDueSoonForAll(repos: Repositories): Promise<void> {
  const today = kstTodayString();
  ensureDueSoonSetForToday(today);
  let scanned = 0;
  let dispatched = 0;
  try {
    if (!(await repos.orgNotifications.isCategoryEnabled("task"))) {
      // 카테고리 자체가 꺼져 있으면 스캔도 건너뛴다 (PG 부하 절감).
      return;
    }
    // dueDate 없는/완료된 task 는 DB 단에서 걸러 전체 스캔 회피.
    const tasks = await repos.tasks.listDueCandidates();
    // 사용자 전체를 한 번만 로드 — assignee 마다 findById 반복 회피.
    const allUsers = await repos.users.list();
    const userById = new Map(allUsers.map((u) => [u.id, u]));
    // project 캐시 — 같은 프로젝트 task 가 여러 건일 때 반복 조회 회피.
    const projectCache = new Map<string, Project | undefined>();
    const getProject = async (projectId: string) => {
      if (projectCache.has(projectId)) return projectCache.get(projectId);
      const p = await repos.projects.findById(projectId);
      projectCache.set(projectId, p);
      return p;
    };

    for (const task of tasks) {
      scanned += 1;
      if (!task.dueDate) continue;
      if (task.status === "done") continue;
      const delta = daysFromTo(task.dueDate, today);
      if (delta > 0) continue; // 미래는 알림 안 보냄 (오늘 또는 지남만)
      const project = await getProject(task.projectId);
      if (!project) continue;
      if (project.status === "cancelled") continue;

      const overdueDays = -delta; // 0 = today, 1+ = overdue
      const subject = `${task.code ?? "T"} ${task.title}`;
      const title =
        overdueDays === 0 ? "오늘 마감 업무" : `마감 지남 업무 (D+${overdueDays})`;
      const body = `${subject} — ${
        overdueDays === 0 ? "오늘 마감" : `${overdueDays}일 지남`
      }`;

      const candidates: string[] = [];
      for (const uid of task.assigneeIds) {
        // 같은 날 같은 사용자×task 에는 한 번만 — 부팅 직후 재발사도 방지.
        if (dueSoonSentToday.has(`${uid}-${task.id}-${today}`)) continue;
        // 멤버십·활성 재검증 (project_members 에서 빠졌거나 휴직 처리된
        // 사용자에게 알림이 가지 않도록).
        if (!project.memberIds.includes(uid)) continue;
        const user = userById.get(uid);
        if (!user || user.isActive === false) continue;
        candidates.push(uid);
      }
      if (candidates.length === 0) continue;
      const settings = await loadSettings(repos, candidates);
      const allowed: string[] = [];
      for (const uid of candidates) {
        if (!settingsAllow(settings?.get(uid), { projectId: project.id })) continue;
        allowed.push(uid);
        dueSoonSentToday.add(`${uid}-${task.id}-${today}`);
      }
      if (allowed.length === 0) continue;
      const created = await repos.notifications.createMany(allowed, {
        kind: "task:due_soon",
        title,
        body,
        link: `/projects/${project.id}/tasks`,
        payload: {
          projectId: project.id,
          taskId: task.id,
          overdueDays
        }
      });
      await dispatchAll(repos, created, settings);
      dispatched += created.length;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[hanmir-server] notifyTaskDueSoonForAll: scanned=${scanned} dispatched=${dispatched} day=${today}`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] notifyTaskDueSoonForAll failed:", err);
  }
}

// Phase 11 — 스레드 답글. 부모 메시지 작성자 + 본문 멘션 대상자만 알린다.
// 일반 메시지처럼 방 전체에 알리지는 않는다 (스레드 내부 잡담이 모든
// 멤버에게 노이즈가 되지 않도록).
//
//   - parent.authorId !== reply.authorId 일 때만 parent 작성자에게 1건
//     ("회신:" kind = "message:reply:new")
//   - mention entities 가 있으면 같은 mention kind (Phase 5 H-3 과 동일
//     dispatch) 로 추가 알림
//   - settings 존중 + 카테고리 게이트(message / mention) 적용
export async function notifyReplyNew(
  repos: Repositories,
  roomId: string,
  parentMessage: ChatMessage,
  reply: ChatMessage
): Promise<void> {
  try {
    const room = await repos.rooms.findById(roomId);
    if (!room) return;
    const [messageEnabled, mentionEnabled] = await Promise.all([
      repos.orgNotifications.isCategoryEnabled("message"),
      repos.orgNotifications.isCategoryEnabled("mention")
    ]);

    const mentionedIds = (reply.entities ?? [])
      .filter((e: MessageEntity) => e.type === "mention")
      .map((e) => e.id)
      .filter((uid) => uid !== reply.authorId);
    const mentionSet = new Set(mentionedIds);
    // 멤버십 강화 — 비멤버에게는 alert 가지 않음.
    const memberMentioned = mentionedIds.filter((uid) =>
      room.members.some((m) => m.userId === uid)
    );

    const notifyParent =
      messageEnabled &&
      parentMessage.authorId !== reply.authorId &&
      !mentionSet.has(parentMessage.authorId);
    const settingsTargets = [
      ...(notifyParent ? [parentMessage.authorId] : []),
      ...(mentionEnabled ? memberMentioned : [])
    ];
    const settings = await loadSettings(repos, settingsTargets);

    // 부모 작성자 알림 — 단, 멘션 대상에 이미 포함돼 있으면 멘션 알림
    // 한 건만 가도록 (이중 노이즈 회피).
    if (notifyParent) {
      if (settingsAllow(settings?.get(parentMessage.authorId), { roomId })) {
        const created = await repos.notifications.createMany([parentMessage.authorId], {
          kind: "message:reply:new",
          title: `${reply.authorName}님이 회신했습니다`,
          body: reply.body.slice(0, 120),
          link: `/chat/${roomId}#m-${parentMessage.id}`,
          payload: {
            roomId,
            parentMessageId: parentMessage.id,
            messageId: reply.id,
            roomName: room.name
          }
        });
        await dispatchAll(repos, created, settings);
      }
    }

    if (mentionEnabled && memberMentioned.length > 0) {
      const allowed = memberMentioned.filter((uid) =>
        settingsAllow(settings?.get(uid), { roomId })
      );
      if (allowed.length > 0) {
        const created = await repos.notifications.createMany(allowed, {
          kind: "mention",
          title: `${reply.authorName}님이 회원님을 언급했습니다`,
          body: reply.body.slice(0, 120),
          link: `/chat/${roomId}#m-${parentMessage.id}`,
          payload: { roomId, parentMessageId: parentMessage.id, messageId: reply.id }
        });
        await dispatchAll(repos, created, settings);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] notifyReplyNew failed:", err);
  }
}

// 결정사항 등록 — 프로젝트 멤버 (decided_by 제외)
export async function notifyDecisionNew(
  repos: Repositories,
  decision: Decision
): Promise<void> {
  try {
    if (!(await repos.orgNotifications.isCategoryEnabled("decision"))) return;
    const project = await repos.projects.findById(decision.projectId);
    if (!project) return;
    const recipients = project.memberIds.filter((uid) => uid !== decision.decidedById);
    const settings = await loadSettings(repos, recipients);
    const allowed = recipients.filter((uid) =>
      settingsAllow(settings?.get(uid), { projectId: project.id })
    );
    if (allowed.length === 0) return;
    const created = await repos.notifications.createMany(allowed, {
      kind: "decision:new",
      title: "새 결정사항이 등록되었습니다",
      body: decision.title,
      link: `/projects/${project.id}/decisions`,
      payload: { projectId: project.id, decisionId: decision.id }
    });
    await dispatchAll(repos, created, settings);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] notifyDecisionNew failed:", err);
  }
}
