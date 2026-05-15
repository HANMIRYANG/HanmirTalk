import type { ChatMessage, Room } from "@hanmir/shared";
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
  async sendMessage(roomId: string, body: string, opts: AuthOptions = {}): Promise<ChatMessage> {
    return apiRequest<ChatMessage>(`/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: "POST",
      body: { body },
      token: opts.token
    });
  },
  async getPinnedMessage(
    roomId: string,
    opts: AuthOptions = {}
  ): Promise<{ author: string; body: string } | undefined> {
    return apiRequestOrNull<{ author: string; body: string }>(
      `/rooms/${encodeURIComponent(roomId)}/pinned`,
      { token: opts.token }
    );
  }
};
