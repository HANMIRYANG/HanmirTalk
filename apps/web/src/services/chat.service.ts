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
  }
};
