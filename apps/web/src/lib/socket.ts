"use client";

import { io, type Socket } from "socket.io-client";
import { apiBaseUrl } from "@/services/api-client";

// Derive socket.io URL from the API base. apiBaseUrl includes the
// `/api/v1` suffix which socket.io must NOT see — it owns its own
// namespace at the root path.
function socketOrigin(): string {
  try {
    // apiBaseUrl 이 상대경로("/api/v1")면 현재 페이지 origin 기준으로 해석.
    // 절대 URL 이면 두 번째 인자는 무시된다. (use client 라 window 항상 존재)
    const base =
      typeof window !== "undefined" ? window.location.origin : undefined;
    const u = new URL(apiBaseUrl, base);
    u.pathname = "/";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:4000";
  }
}

let cached: Socket | null = null;

// One shared socket per tab. Multiple components subscribe to the same
// connection; we connect lazily on first use and reuse the instance until
// the page reloads. Reconnection is delegated to socket.io's defaults.
// Phase 1 D-3: access token now lives in an httpOnly cookie so the
// browser attaches it automatically via `withCredentials`. We no longer
// read document.cookie or pass `auth.token`.
export function getSocket(): Socket {
  if (cached && cached.connected) return cached;
  if (cached) {
    cached.connect();
    return cached;
  }
  cached = io(socketOrigin(), {
    autoConnect: true,
    transports: ["websocket", "polling"],
    withCredentials: true
  });
  return cached;
}
