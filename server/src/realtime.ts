import type { Server as HttpServer } from "http";
import { Server as SocketServer, type Socket } from "socket.io";
import type {
  ChatMessage,
  Decision,
  Notice,
  Notification,
  PinnedMessageRef,
  Room
} from "@hanmir/shared";
import { sessionStore } from "./auth/session";
import { SESSION_COOKIE } from "./auth/token";
import { config } from "./config";
import type { Repositories } from "./repositories/types";

// Parse the access token from the socket.io handshake. Phase 1 D-3:
// access token now lives in an httpOnly cookie, so JS-side `auth.token` is
// no longer available. We read directly from the handshake cookie header.
// The legacy `auth.token` path is kept as a fallback for non-browser
// clients (CLI tests, scripts) that still pass a bearer token.
function tokenFromHandshake(socket: Socket): string | undefined {
  const cookieHeader = socket.handshake.headers.cookie;
  if (typeof cookieHeader === "string" && cookieHeader.length > 0) {
    const match = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    if (match) return decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  }
  const fromAuth = (socket.handshake.auth as { token?: string } | undefined)?.token;
  if (typeof fromAuth === "string" && fromAuth) return fromAuth;
  const header = socket.handshake.headers.authorization;
  if (typeof header === "string") return header.replace(/^Bearer\s+/i, "");
  return undefined;
}

// Lightweight singleton wrapper around socket.io so route handlers can call
// `realtime.emitMessageNew(...)` without juggling the Server instance. The
// app boot wires it once via `attachRealtime(httpServer)`.
class Realtime {
  private io: SocketServer | null = null;
  // Wired in attach(). Needed by `room:join` to verify that the joining
  // socket is actually a member of the requested room — without this gate
  // any authenticated user could subscribe to any room's broadcast channel
  // (Phase 1 D-8).
  private repos: Repositories | null = null;

  attach(httpServer: HttpServer, repos: Repositories): void {
    if (this.io) return;
    this.repos = repos;
    const io = new SocketServer(httpServer, {
      cors: {
        origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((s) => s.trim()),
        credentials: true
      },
      // Long-poll fallback is fine; clients without WS will still get events.
      transports: ["websocket", "polling"]
    });

    // Authenticate on handshake. Browsers send the access token via the
    // httpOnly `hanmir_token` cookie (D-3); non-browser clients may still
    // pass a bearer via `auth.token` or Authorization header.
    io.use((socket, next) => {
      const token = tokenFromHandshake(socket);
      const session = sessionStore.resolve(token);
      if (!session) {
        next(new Error("unauthorized"));
        return;
      }
      (socket.data as { userId: string }).userId = session.userId;
      next();
    });

    io.on("connection", (socket: Socket) => {
      // Phase 4 G-1 — auto-join a per-user channel so room lifecycle
      // events (room:created / :updated / :membership) reach every tab
      // for this user regardless of which rooms they're currently viewing.
      const userId = (socket.data as { userId: string }).userId;
      if (userId) socket.join(`user:${userId}`);

      // Clients explicitly subscribe to each room they're viewing so we
      // don't blast every message to every connection. Notice events are
      // app-wide and go to all connected sockets.
      socket.on("room:join", async (roomId: unknown) => {
        if (typeof roomId !== "string" || !roomId) return;
        const userId = (socket.data as { userId: string }).userId;
        // Defensive: if repos isn't wired (shouldn't happen post-attach),
        // refuse rather than silently allow.
        if (!this.repos || !userId) return;
        const allowed = await this.canAccessRoom(roomId, userId);
        if (!allowed) return; // silently ignore join attempts to foreign rooms
        socket.join(`room:${roomId}`);
      });
      socket.on("room:leave", (roomId: unknown) => {
        if (typeof roomId === "string" && roomId) socket.leave(`room:${roomId}`);
      });
      // Phase 3 F-1 — project channel for decision events. Membership is
      // gated by canAccessProject (mirror of canAccessRoom): admin pass,
      // otherwise project member only. Silent ignore for foreign projects.
      socket.on("project:join", async (projectId: unknown) => {
        if (typeof projectId !== "string" || !projectId) return;
        const userId = (socket.data as { userId: string }).userId;
        if (!this.repos || !userId) return;
        const allowed = await this.canAccessProject(projectId, userId);
        if (!allowed) return;
        socket.join(`project:${projectId}`);
      });
      socket.on("project:leave", (projectId: unknown) => {
        if (typeof projectId === "string" && projectId)
          socket.leave(`project:${projectId}`);
      });
    });

    this.io = io;
    // eslint-disable-next-line no-console
    console.log("[hanmir-server] realtime: socket.io attached");
  }

  // Mirror of the HTTP `ensureRoomAccess` helper. Admin/super_admin can
  // subscribe to any room; everyone else must appear in `room.members`.
  private async canAccessRoom(roomId: string, userId: string): Promise<boolean> {
    if (!this.repos) return false;
    const [room, user] = await Promise.all([
      this.repos.rooms.findById(roomId, userId),
      this.repos.users.findById(userId)
    ]);
    if (!room || !user) return false;
    if (user.role === "admin" || user.role === "super_admin") return true;
    return room.members.some((m) => m.userId === userId);
  }

  // Mirror of the HTTP `ensureProjectAccess` helper for the project
  // broadcast channel (used by decision events).
  private async canAccessProject(projectId: string, userId: string): Promise<boolean> {
    if (!this.repos) return false;
    const [project, user] = await Promise.all([
      this.repos.projects.findById(projectId),
      this.repos.users.findById(userId)
    ]);
    if (!project || !user) return false;
    if (user.role === "admin" || user.role === "super_admin") return true;
    return project.memberIds.includes(userId);
  }

  emitMessageNew(roomId: string, message: ChatMessage): void {
    this.io?.to(`room:${roomId}`).emit("message:new", message);
  }

  // Phase 2 E-1 — message edited. Payload is the full updated ChatMessage
  // (post-mask) so clients can patch their local list by id.
  emitMessageUpdated(roomId: string, message: ChatMessage): void {
    this.io?.to(`room:${roomId}`).emit("message:updated", message);
  }

  // Phase 2 E-1 — message soft-deleted. We send the whole masked message
  // (not just the id) so clients can update body + isDeleted in one shot.
  emitMessageDeleted(roomId: string, message: ChatMessage): void {
    this.io?.to(`room:${roomId}`).emit("message:deleted", message);
  }

  emitRoomPinChanged(roomId: string, pinned: PinnedMessageRef | null): void {
    this.io?.to(`room:${roomId}`).emit("room:pin", { roomId, pinned });
  }

  emitNoticeNew(notice: Notice): void {
    this.io?.emit("notice:new", notice);
  }

  // Phase 4 G-1 — room lifecycle events. We broadcast to every member's
  // *user channel* so the ChatList in their open tabs refreshes. Each
  // socket auto-joins `user:<userId>` on connect (handler below).
  emitRoomCreated(room: Room): void {
    for (const m of room.members) {
      this.io?.to(`user:${m.userId}`).emit("room:created", room);
    }
  }

  emitRoomUpdated(room: Room): void {
    // Send to room members + the room's own broadcast channel (for the
    // header / RoomInfoPane currently open).
    for (const m of room.members) {
      this.io?.to(`user:${m.userId}`).emit("room:updated", room);
    }
    this.io?.to(`room:${room.id}`).emit("room:updated", room);
  }

  emitRoomMembershipChanged(
    roomId: string,
    change: { kind: "join" | "leave"; userId: string; archived?: boolean }
  ): void {
    this.io?.to(`room:${roomId}`).emit("room:membership", { roomId, ...change });
    // Also notify the leaver's other tabs so their ChatList drops the room.
    this.io?.to(`user:${change.userId}`).emit("room:membership", { roomId, ...change });
  }

  // Phase 3 F-1 — decisions are project-scoped, so we broadcast to a
  // project-specific channel. Subscribers (decisions page) join via
  // `project:<id>` when mounted. The decision payload is already
  // masked / decorated by the API layer.
  emitDecisionNew(projectId: string, decision: Decision): void {
    this.io?.to(`project:${projectId}`).emit("decision:new", decision);
  }

  emitDecisionUpdated(projectId: string, decision: Decision): void {
    this.io?.to(`project:${projectId}`).emit("decision:updated", decision);
  }

  emitDecisionDeleted(projectId: string, decision: Decision): void {
    this.io?.to(`project:${projectId}`).emit("decision:deleted", decision);
  }

  // Phase 6 I-2 — per-user notification. 사용자 본인의 user:<id> 채널로만
  // emit (다른 누구도 못 받음). Topbar 종 아이콘이 이 이벤트로 unread
  // 배지 실시간 갱신.
  emitNotificationNew(notification: Notification): void {
    this.io?.to(`user:${notification.userId}`).emit("notification:new", notification);
  }
}

export const realtime = new Realtime();
