"use client";

import { io, type Socket } from "socket.io-client";
import { apiBaseUrl } from "@/services/api-client";
import { SESSION_COOKIE } from "@/lib/client-auth";

// Derive socket.io URL from the API base. apiBaseUrl includes the
// `/api/v1` suffix which socket.io must NOT see — it owns its own
// namespace at the root path.
function socketOrigin(): string {
  try {
    const u = new URL(apiBaseUrl);
    u.pathname = "/";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:4000";
  }
}

function readCookieToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : undefined;
}

let cached: Socket | null = null;

// One shared socket per tab. Multiple components subscribe to the same
// connection; we connect lazily on first use and reuse the instance until
// the page reloads. Reconnection is delegated to socket.io's defaults.
export function getSocket(): Socket {
  if (cached && cached.connected) return cached;
  if (cached) {
    cached.connect();
    return cached;
  }
  cached = io(socketOrigin(), {
    autoConnect: true,
    transports: ["websocket", "polling"],
    auth: () => ({ token: readCookieToken() }),
    withCredentials: true
  });
  return cached;
}

export function disconnectSocket(): void {
  if (cached) {
    cached.disconnect();
    cached = null;
  }
}
