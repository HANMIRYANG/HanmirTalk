import { apiRequest } from "./api-client";

// Phase 6 I-5 — Web Push subscription. 브라우저 PushManager로
// subscribe한 결과를 서버에 등록 / 해제.

export interface AuthOptions {
  token?: string;
}

interface VapidKeyResponse {
  publicKey: string;
}

export const pushService = {
  async getPublicKey(opts: AuthOptions = {}): Promise<string | null> {
    try {
      const res = await apiRequest<VapidKeyResponse>(
        "/push-subscriptions/vapid-public-key",
        { token: opts.token, expectStatus: [200] }
      );
      return res.publicKey;
    } catch {
      // 503 push_disabled 등 — 키 없음
      return null;
    }
  },

  async registerSubscription(
    subscription: PushSubscription,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>("/push-subscriptions", {
      method: "POST",
      body: subscription.toJSON(),
      token: opts.token
    });
  },

  async unregisterSubscription(
    endpoint: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>("/push-subscriptions", {
      method: "DELETE",
      body: { endpoint },
      token: opts.token
    });
  }
};

// 사용자가 push 활성화 토글 켤 때 호출. SW 등록 + permission 요청 +
// PushManager.subscribe + 서버 등록 한 번에. 실패 시 throw.
export async function enablePush(): Promise<void> {
  if (typeof window === "undefined") throw new Error("ssr_no_push");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("push_unsupported");
  }
  const publicKey = await pushService.getPublicKey();
  if (!publicKey) throw new Error("push_disabled_server");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("permission_denied");

  // SW 등록 보장. PwaRegister가 production에서만 등록하므로 dev에서도
  // push 테스트하려면 여기서 강제로 등록.
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // 이미 구독된 게 있으면 그대로 사용, 없으면 새로 구독.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }
  await pushService.registerSubscription(sub);
}

export async function disablePush(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await pushService.unregisterSubscription(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe();
  }
}

// VAPID public key는 base64url 인코딩. PushManager.subscribe가 요구하는
// Uint8Array로 변환.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
