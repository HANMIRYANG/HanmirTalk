import type {
  ChatMessage,
  CreateReplyInput,
  CreateRoomInput,
  CreateScheduledMessageInput,
  MentionSearchResult,
  MentionSearchScope,
  MessageEntity,
  MessageReaction,
  PinnedMessageRef,
  Room,
  ScheduledMessage,
  UpdateRoomInput
} from "@hanmir/shared";
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
    opts: AuthOptions & {
      attachmentId?: string;
      entities?: MessageEntity[];
      // Phase 5 H-5 — AI provenance forwarding. Only AiCommandModal sets these
      // when the user clicks [채팅에 삽입]. Server-side sanitize rejects bad
      // values (rooms.ts), so the worst the client can do is fail to mark
      // its own message as AI.
      aiGenerated?: boolean;
      aiCommand?: string;
      sourceMessageIds?: string[];
    } = {}
  ): Promise<ChatMessage> {
    const { token, attachmentId, entities, aiGenerated, aiCommand, sourceMessageIds } = opts;
    const payload: {
      body: string;
      attachmentId?: string;
      entities?: MessageEntity[];
      aiGenerated?: boolean;
      aiCommand?: string;
      sourceMessageIds?: string[];
    } = { body };
    if (attachmentId) payload.attachmentId = attachmentId;
    if (entities && entities.length > 0) payload.entities = entities;
    if (aiGenerated) payload.aiGenerated = true;
    if (aiCommand) payload.aiCommand = aiCommand;
    if (sourceMessageIds && sourceMessageIds.length > 0) {
      payload.sourceMessageIds = sourceMessageIds;
    }
    return apiRequest<ChatMessage>(`/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: "POST",
      body: payload,
      token
    });
  },

  // Phase 5 H-1 — @mention popover의 검색 호출. scope는 콤마 구분.
  // 기본 user만. limit 기본 20.
  async searchMentions(
    q: string,
    opts: AuthOptions & { scope?: MentionSearchScope[]; limit?: number } = {}
  ): Promise<MentionSearchResult[]> {
    const query: Record<string, string | number> = { q };
    if (opts.scope && opts.scope.length > 0) {
      query.scope = opts.scope.join(",");
    }
    if (opts.limit) query.limit = opts.limit;
    const response = await apiRequest<{ results: MentionSearchResult[] }>(
      "/mentions/search",
      { query, token: opts.token }
    );
    return response.results;
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
  },

  // ── Phase 4 G-1/G-2 — room operations ──────────────────────────────

  // Create a new room. Caller becomes owner. Returns the created Room.
  async createRoom(input: CreateRoomInput, opts: AuthOptions = {}): Promise<Room> {
    return apiRequest<Room>("/rooms", {
      method: "POST",
      body: input,
      token: opts.token
    });
  },

  async updateRoom(
    roomId: string,
    input: UpdateRoomInput,
    opts: AuthOptions = {}
  ): Promise<Room> {
    return apiRequest<Room>(`/rooms/${encodeURIComponent(roomId)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },

  // Find or create the DM room between caller and `userId`. Idempotent —
  // safe to call from a "1:1 대화 시작" button without checking first.
  async openDirectMessage(userId: string, opts: AuthOptions = {}): Promise<Room> {
    return apiRequest<Room>("/rooms/direct", {
      method: "POST",
      body: { userId },
      token: opts.token,
      // Server returns 200 (existing) or 201 (newly created).
      expectStatus: [200, 201]
    });
  },

  async addMember(
    roomId: string,
    userId: string,
    opts: AuthOptions = {}
  ): Promise<Room> {
    return apiRequest<Room>(`/rooms/${encodeURIComponent(roomId)}/members`, {
      method: "POST",
      body: { userId },
      token: opts.token
    });
  },

  async removeMember(
    roomId: string,
    userId: string,
    opts: AuthOptions = {}
  ): Promise<Room> {
    return apiRequest<Room>(
      `/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE", token: opts.token }
    );
  },

  async muteRoom(roomId: string, opts: AuthOptions = {}): Promise<Room> {
    return apiRequest<Room>(`/rooms/${encodeURIComponent(roomId)}/mute`, {
      method: "POST",
      token: opts.token
    });
  },

  async unmuteRoom(roomId: string, opts: AuthOptions = {}): Promise<Room> {
    return apiRequest<Room>(`/rooms/${encodeURIComponent(roomId)}/mute`, {
      method: "DELETE",
      token: opts.token
    });
  },

  // Leave the room. Returns `{ ok, archived }` — archived=true means the
  // caller was the last member and the room is now soft-archived.
  async leaveRoom(
    roomId: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean; archived: boolean }> {
    return apiRequest<{ ok: boolean; archived: boolean }>(
      `/rooms/${encodeURIComponent(roomId)}/leave`,
      { method: "POST", token: opts.token }
    );
  },

  // ── Phase 10 M-4 — 예약 전송 ───────────────────────────────────────

  async scheduleMessage(
    input: CreateScheduledMessageInput,
    opts: AuthOptions = {}
  ): Promise<ScheduledMessage> {
    return apiRequest<ScheduledMessage>("/messages/schedule", {
      method: "POST",
      body: input,
      token: opts.token,
      expectStatus: [201]
    });
  },

  async listScheduledMessages(
    opts: AuthOptions & { roomId?: string } = {}
  ): Promise<ScheduledMessage[]> {
    const query: Record<string, string> = {};
    if (opts.roomId) query.roomId = opts.roomId;
    const response = await apiRequest<{ results: ScheduledMessage[] }>(
      "/messages/scheduled",
      { query, token: opts.token }
    );
    return response.results;
  },

  async cancelScheduledMessage(
    id: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(
      `/messages/scheduled/${encodeURIComponent(id)}`,
      { method: "DELETE", token: opts.token }
    );
  },

  // ── Phase 11 — 스레드 답글 ─────────────────────────────────────────

  async listReplies(
    parentMessageId: string,
    opts: AuthOptions = {}
  ): Promise<ChatMessage[]> {
    const response = await apiRequest<{ results: ChatMessage[] }>(
      `/messages/${encodeURIComponent(parentMessageId)}/replies`,
      { token: opts.token }
    );
    return response.results;
  },

  async createReply(
    parentMessageId: string,
    input: CreateReplyInput,
    opts: AuthOptions = {}
  ): Promise<ChatMessage> {
    return apiRequest<ChatMessage>(
      `/messages/${encodeURIComponent(parentMessageId)}/replies`,
      {
        method: "POST",
        body: input,
        token: opts.token,
        expectStatus: [201]
      }
    );
  },

  // ── Phase 11 — 이모지 반응 ─────────────────────────────────────────

  async addReaction(
    messageId: string,
    emoji: string,
    opts: AuthOptions = {}
  ): Promise<MessageReaction[]> {
    const response = await apiRequest<{ ok: boolean; reactions: MessageReaction[] }>(
      `/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
      { method: "PUT", token: opts.token }
    );
    return response.reactions;
  },

  async removeReaction(
    messageId: string,
    emoji: string,
    opts: AuthOptions = {}
  ): Promise<MessageReaction[]> {
    const response = await apiRequest<{ ok: boolean; reactions: MessageReaction[] }>(
      `/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
      { method: "DELETE", token: opts.token }
    );
    return response.reactions;
  }
};
