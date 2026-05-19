import { Router } from "express";
import type { Repositories } from "../repositories/types";
import { isPushEnabled, getPublicKey } from "../push";

// Phase 6 I-5 — frontend의 PushManager.subscribe() 결과를 서버에 등록.
// 브라우저가 만든 PushSubscription을 그대로 보내면 endpoint + keys로 저장.
//
// GET /vapid-public-key — 프론트가 PushManager.subscribe 시 사용할
// applicationServerKey. VAPID 없으면 503.

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export function createPushSubscriptionsRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/vapid-public-key", (_req, res) => {
    if (!isPushEnabled()) {
      res.status(503).json({ error: "push_disabled" });
      return;
    }
    res.json({ publicKey: getPublicKey() });
  });

  router.post("/", async (req, res) => {
    if (!isPushEnabled()) {
      res.status(503).json({ error: "push_disabled" });
      return;
    }
    const me = req.currentUser!;
    const body = req.body as
      | { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
      | undefined;
    const endpoint = isString(body?.endpoint) ? body!.endpoint : "";
    const p256dh = isString(body?.keys?.p256dh) ? body!.keys!.p256dh : "";
    const auth = isString(body?.keys?.auth) ? body!.keys!.auth : "";
    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ error: "invalid_subscription" });
      return;
    }
    const userAgent = req.header("user-agent") ?? undefined;
    const rec = await repos.pushSubscriptions.upsert({
      userId: me.id,
      endpoint,
      p256dh,
      auth,
      userAgent
    });
    res.status(201).json({ ok: true, id: rec.id });
  });

  router.delete("/", async (req, res) => {
    const me = req.currentUser!;
    const endpoint =
      isString(req.body?.endpoint) ? (req.body.endpoint as string) : "";
    if (!endpoint) {
      res.status(400).json({ error: "endpoint_required" });
      return;
    }
    const ok = await repos.pushSubscriptions.deleteByEndpoint(me.id, endpoint);
    res.json({ ok });
  });

  return router;
}
