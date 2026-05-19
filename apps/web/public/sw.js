/*
 * 한미르톡 service worker — MVP shell
 *
 * Strategy: network-first for navigation requests (so dashboard data stays
 * fresh), cache-first for hashed static assets (Next /_next/*). API requests
 * are never cached — the auth cookie + real-time WebSocket make stale
 * responses harmful.
 *
 * Bump CACHE_VERSION whenever this file changes so old caches get evicted.
 */
const CACHE_VERSION = "hanmir-talk-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

self.addEventListener("install", (event) => {
  // Take over immediately on first install so the user doesn't see the old
  // (un-cached) shell.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k.startsWith("hanmir-talk-"))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache API / socket.io / uploads endpoints.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/socket.io/") ||
    url.pathname.includes("/download")
  ) {
    return;
  }

  // Hashed static assets: cache-first, then network.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit ?? Response.error();
        }
      })
    );
    return;
  }

  // Navigation requests: network-first so SSR updates are reflected; fall
  // back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // Cache the latest navigation response under a generic key.
          const cache = await caches.open(STATIC_CACHE);
          cache.put("/_offline-shell", res.clone()).catch(() => undefined);
          return res;
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const cached = await cache.match("/_offline-shell");
          return cached ?? new Response("Offline", { status: 503 });
        }
      })()
    );
  }
});

// Phase 6 I-5 — Web Push. 서버가 web-push 라이브러리로 보낸 payload는
// JSON 문자열. event.data가 비어있는 경우(브라우저별로 발생 가능)도
// 안전하게 처리.
self.addEventListener("push", (event) => {
  let payload = { title: "한미르톡 알림", body: "", link: "/", tag: undefined };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text() || "";
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { link: payload.link },
      icon: "/assets/hanmir-logo.png",
      badge: "/assets/hanmir-logo.png"
    })
  );
});

// 알림 클릭 시 해당 link로 이동. 이미 그 URL에 열린 탭이 있으면
// focus, 없으면 새로 open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (client.url.includes(link) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
    })()
  );
});
