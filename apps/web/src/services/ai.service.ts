import { apiRequest } from "./api-client";

export interface AuthOptions {
  token?: string;
}

export type AiScope = "recent20" | "today" | "thread" | "messageIds";

export interface AiResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  sourceMessageIds: string[];
}

export type AiCommand =
  | "chat-summary"
  | "extract-tasks"
  | "extract-decisions"
  | "draft-notice"
  | "minutes";

// Phase 5 H-5 — call the AI command endpoints. Always returns the text
// and the source message ids so the UI can attribute the draft back to
// its inputs.
async function callCommand(
  command: AiCommand,
  body: { roomId: string; scope: AiScope; messageIds?: string[] },
  opts: AuthOptions = {}
): Promise<AiResult> {
  return apiRequest<AiResult>(`/ai/${command}`, {
    method: "POST",
    body,
    token: opts.token
  });
}

export const aiService = {
  summarize: (body: { roomId: string; scope: AiScope; messageIds?: string[] }, opts?: AuthOptions) =>
    callCommand("chat-summary", body, opts),
  extractTasks: (body: { roomId: string; scope: AiScope; messageIds?: string[] }, opts?: AuthOptions) =>
    callCommand("extract-tasks", body, opts),
  extractDecisions: (body: { roomId: string; scope: AiScope; messageIds?: string[] }, opts?: AuthOptions) =>
    callCommand("extract-decisions", body, opts),
  draftNotice: (body: { roomId: string; scope: AiScope; messageIds?: string[] }, opts?: AuthOptions) =>
    callCommand("draft-notice", body, opts),
  minutes: (body: { roomId: string; scope: AiScope; messageIds?: string[] }, opts?: AuthOptions) =>
    callCommand("minutes", body, opts)
};
