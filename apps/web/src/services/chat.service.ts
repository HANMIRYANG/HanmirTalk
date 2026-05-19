import type { ChatMessage, PinnedMessageRef, Room } from "@hanmir/shared";
import { apiRequest, apiRequestOrNull } from "./api-client";

export interface AuthOptions {
  token?: string;
}

export const chatService = {
  async listRooms(opts: AuthOptions = {}): Promise<Room[]> {
    return apiRequest<Room[]>("/rooms", { token: opts.token });
  },
  async getRoom(id: string, opts: AuthOptions = {}): Promise<Room | undefined> {
    return apiRequestOrNull<Room>(`/rooms/${encodeURIComponent(id)}`, { token: opts.token });
  },
  async listMessages(roomId: string, opts: AuthOptions = {}): Promise<ChatMessage[]> {
    return apiRequest<ChatMessage[]>(`/rooms/${encodeURIComponent(roomId)}/messages`, {
      token: opts.token
    });
  },
  async sendMessage(
    roomId: string,
    body: string,
    opts: AuthOptions & { attachmentId?: string } = {}
  ): Promise<ChatMessage> {
    const { token, attachmentId } = opts;
    const payload: { body: string; attachmentId?: string } = { body };
    if (attachmentId) payload.attachmentId = attachmentId;
    return apiRequest<ChatMessage>(`/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: "POST",
      body: payload,
      token
    });
  },
  async getPinnedMessage(
    roomId: string,
    opts: AuthOptions = {}
  ): Promise<PinnedMessageRef | undefined> {
    return apiRequestOrNull<PinnedMessageRef>(
      `/rooms/${encodeURIComponent(roomId)}/pinned`,
      { token: opts.token }
    );
  },
  async markRead(
    roomId: string,
    lastMessageId: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/rooms/${encodeURIComponent(roomId)}/read`, {
      method: "POST",
      body: { lastMessageId },
      token: opts.token
    });
  },
  async pinMessage(
    roomId: string,
    messageId: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean; pinned?: PinnedMessageRef }> {
    return apiRequest<{ ok: boolean; pinned?: PinnedMessageRef }>(
      `/rooms/${encodeURIComponent(roomId)}/pin`,
      { method: "POST", body: { messageId }, token: opts.token }
    );
  },
  async unpinMessage(roomId: string, opts: AuthOptions = {}): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/rooms/${encodeURIComponent(roomId)}/pin`, {
      method: "DELETE",
      token: opts.token
    });
  },
  // Phase 2 E-1 — edit own message body. Server enforces author check and
  // returns the updated ChatMessage with `editedAt` set.
  async updateMessage(
    messageId: string,
    body: string,
    opts: AuthOptions = {}
  ): Promise<ChatMessage> {
    return apiRequest<ChatMessage>(`/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      body: { body },
      token: opts.token
    });
  },
  // Phase 2 E-1 — soft delete. Author or admin. Server masks the body and
  // emits message:deleted; the response is { ok: true } and the row stays
  // visible in the room as a tombstone.
  async deleteMessage(
    messageId: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
      token: opts.token
    });
  },
  // Phase 2 E-3 — full message search. Server filters to rooms the caller
  // can read. Returns most recent first. q must be ≥ 2 chars or the
  // server returns empty.
  async searchMessages(
    q: string,
    opts: AuthOptions & { roomId?: string; limit?: number } = {}
  ): Promise<ChatMessage[]> {
    const query: Record<string, string | number> = { q };
    if (opts.roomId) query.roomId = opts.roomId;
    if (opts.limit) query.limit = opts.limit;
    const response = await apiRequest<{ results: ChatMessage[] }>(`/messages/search`, {
      query,
      token: opts.token
    });
    return response.results;
  }
};
