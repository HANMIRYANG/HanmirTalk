import type { ProductDraft, ProjectDraft } from "@hanmir/shared";
import { ApiError, apiBaseUrl, apiRequest } from "./api-client";

export interface AuthOptions {
  token?: string;
}

export interface AiDraftResponse<T> {
  draft: T;
  usage: { inputTokens: number; outputTokens: number };
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
    callCommand("minutes", body, opts),

  // 제품 등록 초안 — MSDS/시험성적서 PDF(1~3건)를 서버 AI 엔드포인트로
  // 보내 폼 초안을 받는다. multipart 라 apiRequest(JSON 강제) 우회 —
  // file.service.uploadFile 선례.
  async draftProduct(files: File[]): Promise<AiDraftResponse<ProductDraft>> {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/ai/product-draft`, {
        method: "POST",
        body: form,
        headers: { Accept: "application/json" },
        credentials: "include"
      });
    } catch (error) {
      throw new ApiError(0, "Network error while requesting product draft", error);
    }
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json().catch(() => undefined) : undefined;
    if (!response.ok) {
      const message =
        (payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).error)
          : undefined) ?? `Product draft failed (${response.status})`;
      throw new ApiError(response.status, message, payload);
    }
    return payload as AiDraftResponse<ProductDraft>;
  },

  // 프로젝트 등록 초안 — 자연어 서술을 폼 필드 + 마일스톤 초안으로 변환.
  async draftProject(prompt: string): Promise<AiDraftResponse<ProjectDraft>> {
    return apiRequest<AiDraftResponse<ProjectDraft>>("/ai/project-draft", {
      method: "POST",
      body: { prompt }
    });
  }
};
