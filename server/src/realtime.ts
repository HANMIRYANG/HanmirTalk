import type { Server as HttpServer } from "http";
import { Server as SocketServer, type Socket } from "socket.io";
import type { ChatMessage, Notice, PinnedMessageRef } from "@hanmir/shared";
import { sessionStore } from "./auth/session";
import { config } from "./config";
import type { Repositories } from "./repositories/types";

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

    // Authenticate on handshake. Clients pass the access token via the
    // `auth.token` field of socket.io's connect handshake. Sockets that
    // can't be resolved get disconnected immediately.
    io.use((socket, next) => {
      const token =
        (socket.handshake.auth as { token?: string } | undefined)?.token ??
        (typeof socket.handshake.headers.authorization === "string"
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
          : undefined);
      const session = sessionStore.resolve(token);
      if (!session) {
        next(new Error("unauthorized"));
        return;
      }
      (socket.data as { userId: string }).userId = session.userId;
      next();
    });

    io.on("connection", (socket: Socket) => {
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

  emitMessageNew(roomId: string, message: ChatMessage): void {
    this.io?.to(`room:${roomId}`).emit("message:new", message);
  }

  emitRoomPinChanged(roomId: string, pinned: PinnedMessageRef | null): void {
    this.io?.to(`room:${roomId}`).emit("room:pin", { roomId, pinned });
  }

  emitNoticeNew(notice: Notice): void {
    this.io?.emit("notice:new", notice);
  }
}

export const realtime = new Realtime();
