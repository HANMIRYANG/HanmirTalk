import webpush from "web-push";
import type { Notification } from "@hanmir/shared";
import type { Repositories } from "./repositories/types";
import { config } from "./config";

// Phase 6 I-5 — Web Push. VAPID 키 없으면 isPushEnabled=false라 모든
// 호출이 no-op. 키 있으면 module 로드 시 setVapidDetails 한 번 호출.
//
// 알림 페이로드는 작아야 함 (Apple iOS는 max 4KB). title/body/url만.

let configured = false;

export function isPushEnabled(): boolean {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(
      config.vapidSubject,
      config.vapidPublicKey,
      config.vapidPrivateKey
    );
    configured = true;
  }
  return true;
}

// Public 키만 노출 (프론트가 PushManager.subscribe 시 applicationServerKey
// 로 사용). 비밀키는 절대 노출 X.
export function getPublicKey(): string | null {
  return config.vapidPublicKey ?? null;
}

export interface PushPayload {
  title: string;
  body?: string;
  link?: string;
  // 일부 클라이언트에서 grouping 기준으로 쓰는 tag.
  tag?: string;
}

// 한 사용자의 모든 등록 endpoint에 발송. 410 Gone (구독 만료) 응답은
// 자동으로 DB에서 정리. 실패는 silent — push 누락이 본 작업을 깨면 안 됨.
export async function pushToUser(
  repos: Repositories,
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!isPushEnabled()) return;
  try {
    const subs = await repos.pushSubscriptions.listForUser(userId);
    if (subs.length === 0) return;
    const json = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth }
            },
            json
          );
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            // Endpoint gone — drop it so we stop trying.
            await repos.pushSubscriptions.delete(s.id).catch(() => undefined);
            return;
          }
          // eslint-disable-next-line no-console
          console.warn(
            `[hanmir-server] push send failed for sub ${s.id}: ${
              err instanceof Error ? err.message : err
            }`
          );
        }
      })
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[hanmir-server] pushToUser failed:", err);
  }
}

// 사용자가 만든 알림(in-app Notification row)을 OS push로 발사.
export async function pushNotification(
  repos: Repositories,
  notification: Notification
): Promise<void> {
  await pushToUser(repos, notification.userId, {
    title: notification.title,
    body: notification.body,
    link: notification.link,
    tag: notification.id
  });
}
